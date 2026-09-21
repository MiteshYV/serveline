/**
 * Placing an order from the customer page — Build Spec §6, Ideation §8 flows 3–5.
 *
 * Framework-free on purpose: the server action in app/(customer)/r/[slug]/checkout/actions.ts
 * validates the request and hands a clean input here, and place-order.test.ts runs the same
 * code against a real PGlite. Pricing is core's `priceCart`, redemption is core's `canRedeem`;
 * nothing here recomputes either.
 *
 * Sequence (the commerce repos' own note): getCodeByText → countPriorRedemptions → canRedeem →
 * priceCart → createOrder → recordRedemption → (upi) createLink → attachPayment →
 * upsertCustomerRestaurant → SMS.
 */

import { vendorMode } from '../adapters/mode.ts'
import { payments } from '../adapters/payments/index.ts'
import { sms } from '../adapters/sms/index.ts'
import { CartError, priceCart, type CartErrorCode, type CartItemInput } from '../core/cart.ts'
import { canRedeem, type RedemptionRefusal } from '../core/codes.ts'
import { hasValidConsent } from '../core/consent.ts'
import { paise, type Paise } from '../core/money.ts'
import {
  attachPayment, countPriorRedemptions, createOrder, getCodeByText, getConsent, getPublishedMenu,
  listAddresses, logSms, recordRedemption, toPricedMenu, transitionOrder, upsertCustomerRestaurant,
  type Actor,
} from '../db/repos/index.ts'
import type { customer, outlet, restaurant } from '../db/schema/index.ts'
import type { Lang } from '../ui/i18n.ts'

/** Decided from the URL at load and never asked (design §7.4): `?t=` is a table, anything else is delivery. */
export type PageContext = { kind: 'table'; tableNo: string } | { kind: 'delivery'; code?: string }

/**
 * The voice assistant's `place_order` tool (M2 design "The thirteen tools"): channel `ai_call`,
 * the order linked to its call, delivery or pickup. A separate type rather than a third member
 * of `PageContext`, because the page narrows that union on `code` (app/(customer)/r/[slug]/lib.ts)
 * and a call has no URL to be decided from. `code` is what `apply_code` accepted; it is resolved
 * here exactly as the card's is.
 */
/**
 * `parked`: a handoff left this order for a person to finish (design "Handoff without a telephone").
 * No payment link, no SMS, no usual-order refresh — Build Spec §5.2 refreshes the usual order only
 * "if the order completes", and nobody is asked to pay for an order the counter may cancel.
 */
export type CallContext = { kind: 'call'; fulfilment: 'delivery' | 'pickup'; callId: string; code?: string; notes?: string; parked?: boolean }

export type CodeOutcome =
  | { ok: true; percent: number; code: string; codeId: string; kind: 'win_back_card' | 'manual' }
  | { ok: false; reason: RedemptionRefusal | 'not_found'; code: string }

/**
 * Whether `codeText` gives this customer a discount here and now. Without a customer (the menu
 * page before the phone step) the per-customer count is unknown and taken as zero; the same call
 * runs again with the customer at checkout and at `placeOrder`, which is the one that counts.
 */
export async function resolveCode(
  restaurantId: string,
  codeText: string,
  customerId: string | null,
  now = new Date(),
): Promise<CodeOutcome> {
  const text = codeText.trim().toUpperCase()
  const row = await getCodeByText(restaurantId, text)
  if (!row) return { ok: false, reason: 'not_found', code: text }
  const priorRedemptions = customerId ? await countPriorRedemptions(row, customerId) : 0
  const result = canRedeem(row, { restaurantId, priorRedemptions, now })
  return result.ok
    ? { ok: true, percent: result.percent, code: row.code, codeId: row.id, kind: row.kind }
    : { ok: false, reason: result.reason, code: row.code }
}

export type PlaceOrderInput = {
  restaurant: Pick<typeof restaurant.$inferSelect, 'id' | 'name' | 'slug' | 'status'>
  outlet: Pick<typeof outlet.$inferSelect, 'id' | 'codEnabled'>
  customer: Pick<typeof customer.$inferSelect, 'id' | 'phone' | 'phoneHash'>
  lang: Lang
  context: PageContext | CallContext
  /** Ids and quantities only. The client never sends a price. */
  items: CartItemInput[]
  paymentMethod: 'upi_link' | 'cod' | 'pay_at_table'
  addressId?: string
  /** The app's origin ("https://order.example"), prefixed to a relative payment link in the SMS. */
  origin: string
}

export type PlaceOrderFailure =
  | 'restaurant_closed'
  | 'empty_cart'
  | 'menu_unavailable'
  | 'bad_payment_method'
  | 'cod_disabled'
  | 'address_required'
  | 'code_refused'
  | CartErrorCode

export type PlaceOrderResult =
  | { ok: true; orderId: string; paymentUrl: string | null }
  | { ok: false; reason: PlaceOrderFailure; code?: CodeOutcome & { ok: false } }

export async function placeOrder(input: PlaceOrderInput): Promise<PlaceOrderResult> {
  const { restaurant, outlet, customer, context } = input
  const actor: Actor = { type: 'customer', id: customer.id }

  // Build Spec §8: a suspended (or churned) restaurant takes no orders on any channel. The page
  // 404s it first (app/(customer)/r/[slug]/lib.ts); this is for a tab opened before the
  // suspension, and for every caller that is not the page.
  if (restaurant.status !== 'trialing' && restaurant.status !== 'active') return { ok: false, reason: 'restaurant_closed' }

  if (input.items.length === 0) return { ok: false, reason: 'empty_cart' }

  // The context fixes the fulfilment, the channel and which payment methods exist (Build Spec §6).
  const table = context.kind === 'table'
  const delivery = context.kind === 'delivery' || (context.kind === 'call' && context.fulfilment === 'delivery')
  if (table && input.paymentMethod !== 'pay_at_table') return { ok: false, reason: 'bad_payment_method' }
  if (!table && input.paymentMethod === 'pay_at_table') return { ok: false, reason: 'bad_payment_method' }
  if (input.paymentMethod === 'cod' && !outlet.codEnabled) return { ok: false, reason: 'cod_disabled' }

  let addressId: string | undefined
  if (delivery) {
    // Ownership check: the id came from the URL. An address of another customer is "no address".
    const addresses = await listAddresses(customer.id, restaurant.id)
    addressId = addresses.find((a) => a.id === input.addressId)?.id
    if (!addressId) return { ok: false, reason: 'address_required' }
  }

  const menu = await getPublishedMenu(outlet.id)
  if (!menu) return { ok: false, reason: 'menu_unavailable' }

  const codeOutcome = !table && context.code ? await resolveCode(restaurant.id, context.code, customer.id) : null
  if (codeOutcome && !codeOutcome.ok) return { ok: false, reason: 'code_refused', code: codeOutcome }

  let cart
  try {
    cart = priceCart(input.items, toPricedMenu(menu), codeOutcome ? { percent: codeOutcome.percent } : undefined)
  } catch (error) {
    if (error instanceof CartError) return { ok: false, reason: error.code }
    throw error
  }

  const channel = context.kind === 'call' ? 'ai_call' : table ? 'page_table' : 'page_delivery'
  const order = await createOrder({
    restaurantId: restaurant.id,
    outletId: outlet.id,
    channel,
    fulfilment: context.kind === 'call' ? context.fulfilment : table ? 'dine_in' : 'delivery',
    tableNo: table ? context.tableNo : undefined,
    customerId: customer.id,
    addressId,
    callId: context.kind === 'call' ? context.callId : undefined,
    // A parked handoff order carries its reason on the card (design "Handoff without a telephone").
    notes: context.kind === 'call' ? context.notes : undefined,
    paymentMethod: input.paymentMethod,
    discountCodeId: codeOutcome?.codeId,
    cart,
    inputs: input.items,
  }, actor)

  if (codeOutcome) {
    const redemption = await recordRedemption(
      { code: { id: codeOutcome.codeId, restaurantId: restaurant.id, kind: codeOutcome.kind }, customerId: customer.id, orderId: order.id, channel },
      actor,
    )
    // The lost race the codes repo documents: two checkouts passed canRedeem, the index refused
    // the second. That order carries a discount it may not have, so it is cancelled rather than
    // cooked, and the customer is told why and re-confirms the full price.
    if (!redemption.ok) {
      await transitionOrder(order.id, 'cancelled', actor, 'Discount code already redeemed')
      return { ok: false, reason: 'code_refused', code: { ok: false, reason: 'already_redeemed', code: codeOutcome.code } }
    }
  }

  // The per-restaurant profile (Build Spec §4): order statistics need `order_history` consent.
  const consent = await getConsent(customer.id, restaurant.id)
  const consentView = consent
    ? { noticeVersion: consent.noticeVersion, purposes: consent.purposes, withdrawnAt: consent.withdrawnAt }
    : undefined
  const parked = context.kind === 'call' && context.parked === true
  await upsertCustomerRestaurant({
    customerId: customer.id,
    restaurantId: restaurant.id,
    source: codeOutcome ? 'win_back' : context.kind === 'call' ? 'organic_call' : table ? 'table' : 'page',
    firstChannel: channel,
    consentId: consent?.id,
    ...(hasValidConsent(consentView, 'order_history') && !parked
      ? {
          order: {
            totalPaise: cart.totalPaise,
            placedAt: order.placedAt,
            usualOrder: {
              items: input.items.map((item, i) => ({ ...item, name: cart.lines[i]?.itemName ?? '' })),
            },
          },
        }
      : {}),
  }, actor)

  let paymentUrl: string | null = null
  if (parked) {
    // Stays `received` and unpaid; the loop moves it to needs_attention and the counter takes it from there.
  } else if (input.paymentMethod === 'upi_link' && cart.totalPaise > 0) {
    const link = await payments().createLink({
      orderId: order.id,
      amountPaise: cart.totalPaise,
      restaurantId: restaurant.id,
      description: `${restaurant.name} order`,
    })
    await attachPayment({ orderId: order.id, gateway: gatewayName(), linkId: link.linkId, amountPaise: cart.totalPaise }, actor)
    paymentUrl = link.url
    await send(input, 'payment_link', { restaurant: restaurant.name, total: rupees(cart.totalPaise), url: absolute(input.origin, link.url) })
  } else if (input.paymentMethod === 'cod' || input.paymentMethod === 'upi_link') {
    // COD confirms at once (the task's reading of Build Spec §6); a zero-total UPI order has
    // nothing to collect, so it confirms too. Pay-at-table stays `received` for the counter.
    await transitionOrder(order.id, 'confirmed', actor)
  }

  if (!parked) await send(input, 'order_confirm', {
    restaurant: restaurant.name,
    items: cart.lines.map((l) => `${l.qty}x ${l.itemName}${l.variantName ? ` (${l.variantName})` : ''}`).join(', '),
    total: rupees(cart.totalPaise),
    paymentMode: PAYMENT_MODE[input.paymentMethod][input.lang],
  })

  return { ok: true, orderId: order.id, paymentUrl }
}

/** GSM-7 only (templates.ts): a ₹ would triple the cost of an otherwise-English message. */
const rupees = (p: Paise) => `Rs ${(paise(p) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`

const absolute = (origin: string, url: string) => (url.startsWith('/') ? `${origin}${url}` : url)

const gatewayName = () => (vendorMode() === 'mock' ? 'mock' : 'razorpay')

/** The SMS's payment-mode word. Interim Hindi and Kannada, like the templates themselves. */
const PAYMENT_MODE: Record<PlaceOrderInput['paymentMethod'], Record<Lang, string>> = {
  upi_link: { en: 'paid by UPI', hi: 'UPI se bhugtan', kn: 'UPI paavati' },
  cod: { en: 'cash on delivery', hi: 'delivery par nakad', kn: 'delivery nagadu' },
  pay_at_table: { en: 'pay at the table', hi: 'table par bhugtan', kn: 'table paavati' },
}

/**
 * Sends and logs (Build Spec §9: cost per message, phone hash never the number). A failed SMS
 * must not fail the order — the order exists and the counter has it — so it is logged and
 * swallowed; the customer still has the status page.
 */
async function send(
  input: PlaceOrderInput,
  kind: 'order_confirm' | 'payment_link',
  vars: Record<string, string>,
): Promise<void> {
  const provider = vendorMode() === 'mock' ? 'mock' : 'exotel'
  try {
    const sent = await sms().send({ toPhone: input.customer.phone, kind, language: input.lang, vars })
    await logSms({
      restaurantId: input.restaurant.id,
      toPhoneHash: input.customer.phoneHash,
      kind,
      provider,
      providerMessageId: sent.providerMessageId,
      status: 'sent',
      costPaise: sent.costPaise,
      sentAt: new Date(),
    })
  } catch (error) {
    console.error(`[checkout] ${kind} SMS failed for restaurant ${input.restaurant.id}:`, error instanceof Error ? error.message : error)
    await logSms({ restaurantId: input.restaurant.id, toPhoneHash: input.customer.phoneHash, kind, provider, status: 'failed' })
      .catch(() => undefined)
  }
}
