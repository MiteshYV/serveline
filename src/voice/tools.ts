/**
 * The thirteen tool handlers (Build Spec §5.5; M2 design "The thirteen tools"). Thin on purpose:
 * pricing is core's `priceCart`, redemption is `resolveCode`, placement is `placeOrder` — the
 * same functions the ordering page calls, by import (ADR 0004). A handler validates its
 * arguments, checks what only the session knows, calls what exists, and returns a result.
 *
 * Nothing a caller can cause throws across this boundary (M2 design "Error handling"): an
 * unknown item, a refused code, an unserviceable pincode come back as `{ ok: false, reason }`
 * for the model to explain in the caller's language. A programmer error still throws, and the
 * loop ends the call `failed`.
 *
 * Argument schemas are a zod mirror of contracts/voice-tools.json; tools.test.ts asserts the two
 * agree, so the model is validated against exactly the schema it was shown.
 */

import { z } from 'zod'
import { vendorMode } from '../adapters/mode.ts'
import { sms } from '../adapters/sms/index.ts'
import { placeOrder, resolveCode } from '../checkout/place-order.ts'
import { CartError, priceCart, type CartItemInput } from '../core/cart.ts'
import { NOTICE_VERSION, hasValidConsent } from '../core/consent.ts'
import { checkServiceability } from '../core/serviceability.ts'
import {
  getConsent, getCustomer, getOrder, getPublishedMenu, listAddresses, logSms, recordConsent, saveAddress, toPricedMenu, type Actor,
} from '../db/repos/index.ts'
import type { outlet, restaurant } from '../db/schema/index.ts'
import { SPOKEN_PURPOSES } from './notice.ts'
import type { Session } from './session.ts'

export type ToolResult = { ok: true; data: unknown } | { ok: false; reason: string; detail?: unknown }

/** What the loop resolves once per call and every handler may need. No phone number: the row is fetched when an SMS needs it. */
export type ToolDeps = {
  customer: { id: string; phoneHash: string } | null
  restaurant: typeof restaurant.$inferSelect
  outlet: typeof outlet.$inferSelect
  /** "https://order.example" — for the links in SMS and results. */
  origin: string
}

// --- schemas: the zod mirror of contracts/voice-tools.json -------------------------------------

const LANG = z.enum(['hi', 'en', 'kn'])

export const TOOL_SCHEMAS = {
  search_menu: z.object({ query: z.string().min(1).max(120), language: LANG }),
  add_to_cart: z.object({
    item_id: z.string().min(1),
    variant_id: z.string().min(1).optional(),
    option_ids: z.array(z.string().min(1)).optional(),
    qty: z.number().int().min(1).max(99),
  }),
  remove_from_cart: z.object({ line_id: z.string().regex(/^line-\d+$/) }),
  get_cart: z.object({}),
  apply_code: z.object({ code: z.string().min(1).max(32) }),
  check_serviceability: z.object({ area: z.string().min(1).max(80).optional(), pincode: z.string().min(6).max(7).optional() }),
  use_saved_address: z.object({ address_id: z.string().min(1) }),
  capture_rough_address: z.object({ text: z.string().min(3).max(300) }),
  send_sms: z.object({ kind: z.enum(['page_link', 'payment_link']) }),
  record_consent: z.object({ agreed: z.boolean() }),
  place_order: z.object({ fulfilment: z.enum(['delivery', 'pickup']), payment_method: z.enum(['upi_link', 'cod']) }),
  answer_enquiry: z.object({ kind: z.enum(['hours', 'address', 'delivery', 'menu']) }),
  transfer_to_human: z.object({ reason: z.string().min(1).max(200) }),
  end_call: z.object({ reason: z.string().min(1).max(200) }),
} as const

export type ToolName = keyof typeof TOOL_SCHEMAS
export const TOOL_NAMES = Object.keys(TOOL_SCHEMAS) as ToolName[]

type Args<K extends ToolName> = z.infer<(typeof TOOL_SCHEMAS)[K]>
type Handler<K extends ToolName> = (args: Args<K>, session: Session, deps: ToolDeps) => Promise<ToolResult>

// --- helpers -------------------------------------------------------------------------------------

const ok = (data: unknown): ToolResult => ({ ok: true, data })
const refuse = (reason: string, detail?: unknown): ToolResult =>
  detail === undefined ? { ok: false, reason } : { ok: false, reason, detail }

/** Writes made during a call are the assistant's (actor_type `ai`, no row to point at). */
const AI: Actor = { type: 'ai', id: null }

/** For reading aloud: "120" or "120.50". Money stays paise everywhere else (CLAUDE.md). */
const rupees = (p: number): string => (p % 100 === 0 ? String(p / 100) : (p / 100).toFixed(2))

const pageUrl = (deps: ToolDeps) => `${deps.origin}/r/${deps.restaurant.slug}`

/**
 * The cart as the model reads it back: names, quantities, the total in rupees. Priced by core
 * against the items `search_menu` returned this call, with the applied code resolved again by
 * the same function `placeOrder` will use, so the read-back total is the total that gets charged.
 */
async function cartSummary(session: Session, deps: ToolDeps) {
  const code = session.codeText
    ? await resolveCode(deps.restaurant.id, session.codeText, deps.customer?.id ?? null)
    : null
  const cart = priceCart(session.cart, [...session.searchResults.values()], code?.ok ? { percent: code.percent } : undefined)
  return {
    lines: cart.lines.map((l) => ({
      lineId: l.id, name: l.itemName, variant: l.variantName, options: l.optionNames, qty: l.qty,
      lineRupees: rupees(l.linePaise), linePaise: l.linePaise,
    })),
    code: code?.ok ? code.code : null,
    subtotalPaise: cart.subtotalPaise,
    discountPaise: cart.discountPaise,
    totalPaise: cart.totalPaise,
    totalRupees: rupees(cart.totalPaise),
  }
}

// Menu search. ponytail: lower-cased tokens with a small edit-distance tolerance is the ceiling —
// it finds "masala dosa" from "masla dosa" and "biryani" from "biriyani", and nothing said in
// Hindi or Kannada, because dish names are stored in English only (src/db/seed.ts). The upgrade
// is `menu_vocabulary` at M4 (Build Spec §4, §9): spoken aliases per outlet in all three languages.

const tokens = (text: string): string[] => text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean)

function editDistance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const row = [i]
    for (let j = 1; j <= b.length; j++) {
      const swap = (prev[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1)
      row[j] = Math.min((prev[j] ?? 0) + 1, (row[j - 1] ?? 0) + 1, swap)
    }
    prev = row
  }
  return prev[b.length] ?? 0
}

/** Equal, a prefix of three letters or more, or within one edit (two for long words). */
const tokenMatches = (q: string, t: string): boolean =>
  q === t || (q.length >= 3 && t.startsWith(q)) || editDistance(q, t) <= (q.length >= 8 ? 2 : q.length >= 4 ? 1 : 0)

/** Query tokens matched, plus the fraction of the name they cover so "masala dosa" outranks "masala dosa special". */
function matchScore(query: string, name: string): number {
  const nameTokens = tokens(name)
  const matched = tokens(query).filter((q) => nameTokens.some((t) => tokenMatches(q, t))).length
  return matched === 0 ? 0 : matched + matched / nameTokens.length
}

const HOURS = z.record(z.string(), z.array(z.tuple([z.string(), z.string()])))
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

/** `outlet.hours` as src/db/seed.ts shapes it: weekday → [open, close] pairs in IST; empty means closed. */
function hoursText(o: ToolDeps['outlet']): string {
  const parsed = HOURS.safeParse(o.hours)
  if (!parsed.success || Object.keys(parsed.data).length === 0) return 'Opening hours are not set; ask the restaurant.'
  const days = DAYS.filter((d) => d in parsed.data)
    .map((d) => `${d}: ${(parsed.data[d] ?? []).map(([open, close]) => `${open}-${close}`).join(', ') || 'closed'}`)
  const holidays = o.holidayDates.length > 0 ? ` Closed on ${o.holidayDates.join(', ')}.` : ''
  return `${days.join('; ')}.${holidays}`
}

// --- handlers ------------------------------------------------------------------------------------

/** Live `order_fulfilment` consent for this caller at this restaurant — the gate in front of any profile write. */
export async function hasOrderConsent(customerId: string, restaurantId: string): Promise<boolean> {
  const consent = await getConsent(customerId, restaurantId)
  const view = consent ? { noticeVersion: consent.noticeVersion, purposes: consent.purposes, withdrawnAt: consent.withdrawnAt } : undefined
  return hasValidConsent(view, 'order_fulfilment')
}

const handlers: { [K in ToolName]: Handler<K> } = {
  async search_menu({ query }, session, deps) {
    // `language` is accepted for the M4 vocabulary; the M2 matcher above is language-blind.
    const menu = await getPublishedMenu(deps.outlet.id)
    if (!menu) return refuse('menu_unavailable')
    const ranked = toPricedMenu(menu)
      .map((item) => ({ item, score: matchScore(query, item.name) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name))
      .slice(0, 6)
    for (const { item } of ranked) {
      session.searchResults.set(item.id, item)
      session.seenItemIds.add(item.id)
    }
    return ok({
      items: ranked.map(({ item }) => ({
        id: item.id,
        name: item.name,
        priceRupees: rupees(item.pricePaise),
        pricePaise: item.pricePaise,
        variants: item.variants.map((v) => ({ id: v.id, name: v.name, priceDeltaRupees: rupees(v.priceDeltaPaise), priceDeltaPaise: v.priceDeltaPaise })),
        optionGroups: item.optionGroups.map((g) => ({
          id: g.id, name: g.name, minSelect: g.minSelect, maxSelect: g.maxSelect,
          options: g.options.map((o) => ({ id: o.id, name: o.name, priceDeltaRupees: rupees(o.priceDeltaPaise), priceDeltaPaise: o.priceDeltaPaise })),
        })),
      })),
    })
  },

  async add_to_cart(args, session, deps) {
    // Build Spec §5.3 menu grounding, made structural: an id the model was not shown in this
    // call is refused before pricing sees it. The model cannot invent an item or a price because
    // it never supplies either.
    if (!session.seenItemIds.has(args.item_id)) return refuse('item_not_searched')
    const line: CartItemInput = { itemId: args.item_id, variantId: args.variant_id, optionIds: args.option_ids ?? [], qty: args.qty }
    try {
      priceCart([...session.cart, line], [...session.searchResults.values()])
    } catch (error) {
      if (error instanceof CartError) return refuse(error.code)
      throw error
    }
    session.cart.push(line)
    return ok(await cartSummary(session, deps))
  },

  async remove_from_cart({ line_id }, session, deps) {
    // Line ids are the cart position, `line-1` upwards (core/cart priceLine).
    const index = Number(line_id.slice('line-'.length)) - 1
    if (!(index >= 0 && index < session.cart.length)) return refuse('unknown_line')
    session.cart.splice(index, 1)
    return ok(await cartSummary(session, deps))
  },

  async get_cart(_args, session, deps) {
    return ok(await cartSummary(session, deps))
  },

  async apply_code({ code }, session, deps) {
    const outcome = await resolveCode(deps.restaurant.id, code, deps.customer?.id ?? null)
    if (!outcome.ok) return refuse(outcome.reason)
    session.codeText = outcome.code
    return ok({ code: outcome.code, percent: outcome.percent, cart: await cartSummary(session, deps) })
  },

  async check_serviceability({ area, pincode }, _session, deps) {
    const result = checkServiceability({ area, pincode }, { area: deps.outlet.area, serviceablePincodes: deps.outlet.serviceablePincodes })
    return result.ok ? ok({ serviceable: true }) : refuse(result.reason)
  },

  async use_saved_address({ address_id }, session, deps) {
    if (!deps.customer) return refuse('customer_required')
    // Only the caller's own addresses at this restaurant; any other id is "no such address".
    const address = (await listAddresses(deps.customer.id, deps.restaurant.id)).find((a) => a.id === address_id)
    if (!address) return refuse('unknown_address')
    session.addressId = address.id
    // The label, never the line (Build Spec §10: no full address enters the prompt).
    return ok({ addressId: address.id, label: address.label ?? address.area ?? 'saved address' })
  },

  async capture_rough_address({ text }, session, deps) {
    // ponytail: the address-link SMS and the `address_pending` state are M3; at M2 the rough
    // address is saved unconfirmed and the order goes ahead against it.
    if (!deps.customer) return refuse('customer_required')
    const consent = await getConsent(deps.customer.id, deps.restaurant.id)
    // Build Spec §10: an address is a profile field beyond the phone number. `saveAddress` holds
    // the same gate against the live row and throws; this is the non-throwing check in front of it.
    const view = consent ? { noticeVersion: consent.noticeVersion, purposes: consent.purposes, withdrawnAt: consent.withdrawnAt } : undefined
    if (!hasValidConsent(view, 'order_fulfilment')) return refuse('consent_required')
    const row = await saveAddress({
      customerId: deps.customer.id,
      restaurantId: deps.restaurant.id,
      // A fixed label, never the spoken text: the label goes into the prompt on the next call and
      // into tool results (Build Spec §10 — no full address enters the prompt). The text is line1.
      label: 'Spoken address',
      line1: text,
      source: 'voice_rough',
      isConfirmed: false,
    }, AI)
    session.addressId = row.id
    return ok({ addressId: row.id, label: row.label })
  },

  async send_sms({ kind }, session, deps) {
    // The payment link is created by the gateway inside placeOrder and sent from there.
    if (kind === 'payment_link') return refuse('use_place_order')
    if (!deps.customer) return refuse('customer_required')
    const customer = await getCustomer(deps.customer.id)
    if (!customer) return refuse('customer_required')
    const provider = vendorMode() === 'mock' ? 'mock' : 'exotel'
    const log = { restaurantId: deps.restaurant.id, toPhoneHash: customer.phoneHash, kind, provider } as const
    try {
      const sent = await sms().send({ toPhone: customer.phone, kind, language: session.lang, vars: { restaurant: deps.restaurant.name, url: pageUrl(deps) } })
      await logSms({ ...log, providerMessageId: sent.providerMessageId, status: 'sent', costPaise: sent.costPaise, sentAt: new Date() })
      // `costPaise` is for the loop's ledger (call_cost.sms_paise); the model only needs `sent`.
      return ok({ sent: true, costPaise: sent.costPaise })
    } catch (error) {
      console.error(`[voice] page_link SMS failed for call ${session.callId}:`, error instanceof Error ? error.message : error)
      await logSms({ ...log, status: 'failed' }).catch(() => undefined)
      return refuse('sms_failed')
    }
  },

  /**
   * Build Spec §10: "Voice consent is the spoken yes after the notice, captured as channel = call
   * with the call id as evidence." The notice is in the prompt, already read aloud by the time
   * this is called; what is recorded here is the answer, against the version whose spoken
   * rendering the caller actually heard (src/voice/notice.ts).
   */
  async record_consent({ agreed }, session, deps) {
    if (!deps.customer) return refuse('customer_required')
    if (!agreed) return ok({ agreed: false })
    if (await hasOrderConsent(deps.customer.id, deps.restaurant.id)) return ok({ agreed: true, already: true })
    await recordConsent({
      customerId: deps.customer.id,
      restaurantId: deps.restaurant.id,
      noticeVersion: NOTICE_VERSION,
      purposes: [...SPOKEN_PURPOSES],
      channel: 'call',
      language: session.lang,
      evidence: { callId: session.callId, transport: session.transport, rendering: 'spoken' },
    }, AI)
    return ok({ agreed: true })
  },

  async place_order({ fulfilment, payment_method }, session, deps) {
    // The read-back (Build Spec §5.2) is the prompt's rule; the one thing checked here is that
    // there is something to place, so the model gets a reason rather than placeOrder's.
    if (session.cart.length === 0) return refuse('empty_cart')
    if (!deps.customer) return refuse('customer_required')
    // Build Spec §10: placeOrder writes a customer_restaurant profile row, and the web checkout
    // gates that on live consent before calling it. So does the call.
    if (!(await hasOrderConsent(deps.customer.id, deps.restaurant.id))) return refuse('consent_required')
    const customer = await getCustomer(deps.customer.id)
    if (!customer) return refuse('customer_required')
    const result = await placeOrder({
      restaurant: deps.restaurant,
      outlet: deps.outlet,
      customer,
      lang: session.lang,
      context: { kind: 'call', fulfilment, callId: session.callId, code: session.codeText ?? undefined },
      items: session.cart,
      paymentMethod: payment_method,
      addressId: session.addressId ?? undefined,
      origin: deps.origin,
    })
    if (!result.ok) return refuse(result.reason, result.code)
    const order = await getOrder(result.orderId)
    if (!order) throw new Error(`Order ${result.orderId} vanished after placeOrder`)
    return ok({
      orderId: order.id,
      totalPaise: order.totalPaise,
      totalRupees: rupees(order.totalPaise),
      paymentMethod: payment_method,
      // The link itself went by SMS; the model only needs to know whether to say so.
      paymentLinkSent: result.paymentUrl !== null,
      statusUrl: `${pageUrl(deps)}/order/${order.id}`,
    })
  },

  async answer_enquiry({ kind }, _session, deps) {
    const o = deps.outlet
    const text = {
      hours: () => hoursText(o),
      address: () => `${o.addressLine}, ${o.area}, ${o.pincode}.`,
      delivery: () =>
        `Delivers within ${o.deliveryRadiusKm} km of ${o.area}`
        + (o.serviceablePincodes.length > 0 ? `, to pincodes ${o.serviceablePincodes.join(', ')}` : '')
        + `. ${o.codEnabled ? 'Cash on delivery is available.' : 'Payment is by UPI link only.'} Pickup from the outlet is also available.`,
      menu: () => `The full menu is on the ordering page: ${pageUrl(deps)}. For a specific dish, use search_menu.`,
    }[kind]()
    return ok({ kind, text })
  },

  // The loop performs the side effects of these two (end the call, create the needs_attention
  // order on a handoff — M2 design "Handoff without a telephone"); the handlers only signal.
  async transfer_to_human({ reason }) {
    return ok({ action: 'transfer', reason })
  },

  async end_call({ reason }) {
    return ok({ action: 'end', reason })
  },
}

const isToolName = (name: string): name is ToolName => Object.hasOwn(TOOL_SCHEMAS, name)

export async function runTool(name: string, args: unknown, session: Session, deps: ToolDeps): Promise<ToolResult> {
  if (!isToolName(name)) return refuse('unknown_tool')
  const parsed = TOOL_SCHEMAS[name].safeParse(args ?? {})
  if (!parsed.success) {
    return refuse('invalid_args', parsed.error.issues.map((i) => `${i.path.join('.') || '(args)'}: ${i.message}`))
  }
  // The one cast: `name` picked both the schema and the handler, so `parsed.data` is that
  // handler's argument type, which the indexed union cannot express.
  const handler = handlers[name] as Handler<ToolName>
  return handler(parsed.data as Args<ToolName>, session, deps)
}
