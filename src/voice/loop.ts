/**
 * One call, turn by turn — M2 design "The turn"; Build Spec §5.2 (lifecycle) and §5.3
 * (guardrails). `startCall` is the pre-call step, `takeTurn` is one caller utterance in and one
 * reply out, `endCall` is the surface hanging up. Nothing here knows which transport is talking:
 * the browser page and the agent console's simulator post text, and the Exotel transport will
 * post the same (ADR 0004).
 *
 * The rules live elsewhere and are only applied here: the guardrails decide (guardrails.ts), the
 * tools act (tools.ts), the prompt speaks (prompt.ts), the ledger prices (pricing.ts). What this
 * file owns is the order of events and the side effects a signal carries — a transfer parks the
 * cart as a `needs_attention` order, an end classifies the outcome — and the record: every turn
 * as a `call_turn`, every model call in `call_cost`.
 *
 * No `next` import, by design (CLAUDE.md "Where code goes"): loop.test.ts drives the whole
 * conversation under plain `node --test` with the mock model and a temporary database.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import { llm, type LlmRequest, type LlmResponse, type ToolSpec } from '../adapters/llm/index.ts'
import { placeOrder } from '../checkout/place-order.ts'
import { CartError, priceCart } from '../core/cart.ts'
import { hasValidConsent } from '../core/consent.ts'
import {
  addCost, appendTurn, createCall, endCall as finishCall, findCustomerByPhoneHash, getConsent,
  getCustomer, getCustomerRestaurant, getOutlet, getPublishedMenu, listAddresses, toPricedMenu,
  transitionOrder, type Actor, type CallRow, type ToolCallRecord,
} from '../db/repos/index.ts'
import type { customer } from '../db/schema/index.ts'
import type { Lang } from '../ui/i18n.ts'
import { type BeforeModelVerdict, checkBeforeModel, onLlmFailure } from './guardrails.ts'
import { costPaise } from './pricing.ts'
import { buildSystemPrompt, greetingFor, sanitiseCallerText, type ProfileSummary } from './prompt.ts'
import { createSession, deleteSession, getSession, type Session } from './session.ts'
import { runTool, type ToolDeps, type ToolResult } from './tools.ts'

type Outcome = NonNullable<CallRow['outcome']>
type CustomerRow = typeof customer.$inferSelect

/** Design "The turn", step 3: at most four tool rounds per turn; the fifth answer is taken as it is. */
const MAX_TOOL_ROUNDS = 4

/** Writes the assistant makes on the caller's behalf (actor_type `ai`), as tools.ts has it. */
const AI: Actor = { type: 'ai', id: null }

// The tool catalogue the model is shown (Build Spec §5.5). Read from the project root as
// prompt.ts does — contracts/ sits outside any bundle so the Python transport reads the same file
// (ADR 0004) — and validated once, at load: a malformed catalogue is a deploy error, not a call error.
const TOOLS: ToolSpec[] = z.object({
  version: z.literal(1),
  tools: z.array(z.object({ name: z.string(), description: z.string(), parameters: z.record(z.string(), z.unknown()) })),
}).parse(JSON.parse(readFileSync(join(process.cwd(), 'contracts', 'voice-tools.json'), 'utf8'))).tools

/**
 * What the loop needs per call beyond the Session: the rows every tool reads, the profile the
 * prompt is rebuilt from each turn, and the facts the outcome is classified from at the end.
 * Same lifetime and same store as the session (session.ts's ponytail note on Redis applies).
 */
type CallState = {
  deps: ToolDeps
  profile: ProfileSummary | null
  /** The next `call_turn.seq`; the greeting is 0, a caller turn is odd, its reply even. */
  seq: number
  orderId: string | null
  /** add_to_cart succeeded → intent `order`; answer_enquiry was called → `enquiry`; otherwise `unknown`. */
  ordered: boolean
  enquired: boolean
  /** A page_link SMS went out (Build Spec §5.2 enquiry deflection) → an unordered end is `deflected_sms`. */
  deflected: boolean
}

const g = globalThis as unknown as { __serveline_voice_calls?: Map<string, CallState> }
const calls = (g.__serveline_voice_calls ??= new Map<string, CallState>())

// Spoken by the loop itself when the model is not consulted. Interim Hindi and Kannada, not
// native-reviewed — the same caveat as prompt.ts and src/ui/i18n.ts.
const LINES: Record<Lang, { reask: string; transferring: string; ending: string }> = {
  en: {
    reask: "Sorry, I didn't catch that. Could you say it again?",
    transferring: 'Connecting you to the restaurant.',
    ending: 'I am ending this call. Goodbye.',
  },
  hi: {
    reask: 'माफ़ कीजिए, समझ नहीं आया। फिर से बोलिए?',
    transferring: 'आपको रेस्टोरेंट से जोड़ रही हूँ।',
    ending: 'मैं यह कॉल समाप्त कर रही हूँ। नमस्ते।',
  },
  kn: {
    reask: 'ಕ್ಷಮಿಸಿ, ಅರ್ಥವಾಗಲಿಲ್ಲ. ಮತ್ತೆ ಹೇಳುತ್ತೀರಾ?',
    transferring: 'ನಿಮ್ಮನ್ನು ರೆಸ್ಟೋರೆಂಟ್‌ಗೆ ಸಂಪರ್ಕಿಸುತ್ತಿದ್ದೇನೆ.',
    ending: 'ಈ ಕರೆಯನ್ನು ಮುಗಿಸುತ್ತಿದ್ದೇನೆ. ನಮಸ್ಕಾರ.',
  },
}

// --- start ---------------------------------------------------------------------------------------

/**
 * Build Spec §5.2 pre-call: the outlet, the caller by phone hash (or by id, from a customer
 * session cookie), the profile summary if consent exists, the system prompt, the greeting. The
 * `call` row is created here because `order.call_id` references it, and the greeting is turn 0.
 */
export async function startCall(input: {
  outletId: string
  transport: Session['transport']
  customerId?: string
  customerPhoneHash?: string
  lang?: Lang
  providerCallSid?: string
  /** "https://order.example" — for the links in SMS and tool results (tools.ts `ToolDeps`). */
  origin: string
}): Promise<{ callId: string; greeting: string; lang: Lang }> {
  const outlet = await getOutlet(input.outletId)
  if (!outlet) throw new Error(`No outlet ${input.outletId}`)
  const { restaurant } = outlet

  const caller = input.customerId
    ? await getCustomer(input.customerId)
    : input.customerPhoneHash
      ? await findCustomerByPhoneHash(input.customerPhoneHash)
      : null
  const { profile, addressId } = caller ? await loadProfile(caller, restaurant.id, outlet.id) : { profile: null, addressId: null }
  // The page's language when there is one; else the language the customer read the notice in,
  // which customers.ts holds consent-exempt; else English. Followed per turn from here on.
  const lang = input.lang ?? caller?.preferredLanguage ?? 'en'

  const call = await createCall({
    outletId: outlet.id,
    transport: input.transport,
    providerCallSid: input.providerCallSid,
    fromPhoneHash: caller?.phoneHash ?? input.customerPhoneHash,
    customerId: caller?.id,
  })
  const session = createSession({
    callId: call.id, outletId: outlet.id, restaurantId: restaurant.id, transport: input.transport,
    customerId: caller?.id ?? null, phoneHash: caller?.phoneHash ?? null, lang,
  })
  session.addressId = addressId
  calls.set(call.id, {
    deps: { customer: caller ? { id: caller.id, phoneHash: caller.phoneHash } : null, restaurant, outlet, origin: input.origin },
    profile, seq: 1, orderId: null, ordered: false, enquired: false, deflected: false,
  })

  const greeting = greetingFor({ restaurant, lang, profile, transport: input.transport })
  await appendTurn(call.id, { seq: 0, speaker: 'ai', text: greeting, language: lang, startedMs: 0, endedMs: 0 })
  return { callId: call.id, greeting, lang }
}

/**
 * The profile summary, Build Spec §5.2 "if consent exists" and §10 "nothing beyond the phone
 * number without a consent" — by purpose, as contracts/notices/README.md defines them: the name
 * and the saved addresses are `order_fulfilment`, the usual order is `order_history`. A caller
 * with neither is new, and the prompt says nothing about them.
 *
 * `addressId` is the last-used saved address: §5.2 has a returning customer "hear their last-used
 * address label read back for confirmation", so it is the delivery default and use_saved_address
 * overrides it. The prompt still tells the model to read the label back before placing.
 */
async function loadProfile(caller: CustomerRow, restaurantId: string, outletId: string): Promise<{ profile: ProfileSummary | null; addressId: string | null }> {
  const consent = await getConsent(caller.id, restaurantId)
  const view = consent ? { noticeVersion: consent.noticeVersion, purposes: consent.purposes, withdrawnAt: consent.withdrawnAt } : undefined
  const fulfilment = hasValidConsent(view, 'order_fulfilment')
  const history = hasValidConsent(view, 'order_history')
  if (!fulfilment && !history) return { profile: null, addressId: null }

  const addresses = fulfilment ? await listAddresses(caller.id, restaurantId) : []
  const usual = history ? await usualOrderOf(caller.id, restaurantId, outletId) : null
  return {
    profile: {
      firstName: fulfilment ? (caller.name?.trim().split(/\s+/)[0] ?? null) : null,
      usualOrder: usual?.items ?? null,
      usualOrderTotalPaise: usual?.totalPaise ?? null,
      addressLabels: addresses.map((a) => ({ id: a.id, label: a.label ?? a.area ?? 'saved address' })),
      // ponytail: nothing writes customer_preference yet and no repo reads it, so there are no
      // allergies to load. The upgrade is a `getPreferences` in src/db/repos/customers.ts under
      // `personalisation` consent, when the dashboard or the call starts recording them.
      allergies: [],
      preferredLanguage: caller.preferredLanguage,
    },
    addressId: addresses[0]?.id ?? null,
  }
}

// `customer_restaurant.usual_order` as the checkout writes it (`items`, with names) and as
// src/db/seed.ts writes it (`lines`, without). Priced against today's menu, never quoted from
// the stored numbers: the greeting quotes a total the order will actually charge.
const usualLine = z.object({
  itemId: z.string(), variantId: z.string().optional(), optionIds: z.array(z.string()).default([]),
  qty: z.number().int().min(1), name: z.string().optional(),
})
const usualOrderJson = z.object({ items: z.array(usualLine).optional(), lines: z.array(usualLine).optional() })

async function usualOrderOf(customerId: string, restaurantId: string, outletId: string) {
  const parsed = usualOrderJson.safeParse((await getCustomerRestaurant(customerId, restaurantId))?.usualOrder)
  const inputs = parsed.success ? (parsed.data.items ?? parsed.data.lines ?? []) : []
  if (inputs.length === 0) return null
  const menu = await getPublishedMenu(outletId)
  try {
    const cart = priceCart(inputs, menu ? toPricedMenu(menu) : [])
    return { items: cart.lines.map((l) => ({ name: l.itemName, qty: l.qty })), totalPaise: cart.totalPaise }
  } catch (error) {
    if (!(error instanceof CartError)) throw error
    // An item has left the menu: the names say what it was, and with no total the greeting does
    // not offer it (prompt.ts greetingFor).
    return { items: inputs.map((l) => ({ name: l.name ?? 'an item', qty: l.qty })), totalPaise: null }
  }
}

// --- turn ----------------------------------------------------------------------------------------

export type TurnResult = {
  reply: string
  toolCalls: ToolCallRecord[]
  ended: boolean
  outcome?: Outcome
  orderId?: string
}

/** How a turn ends the call. `transfer` parks the cart as a needs_attention order (design "Handoff without a telephone"). */
type Closing = { outcome: Outcome; reason: string; transfer: boolean }

/** This turn's ledger entries, written once at the end whatever happened in between. */
type Ledger = { llmPaise: number; tokensIn: number; tokensOut: number; smsPaise: number }

export async function takeTurn(callId: string, turn: { text: string; lang?: Lang; confidence?: number }): Promise<TurnResult> {
  const session = getSession(callId)
  const state = calls.get(callId)
  if (!session || !state || session.ended) throw new Error(`Call ${callId} is not live`)
  // Build Spec §5.2: the pipeline follows the recogniser's language per turn.
  if (turn.lang) session.lang = turn.lang

  const arrivedMs = elapsedMs(session)
  const seq = state.seq
  state.seq += 2
  // Stored as spoken (calls.ts): the review screen needs what the caller said. The model sees
  // the sanitised text, below.
  await appendTurn(callId, { seq, speaker: 'customer', text: turn.text, language: session.lang, asrConfidence: turn.confidence, startedMs: arrivedMs })

  const verdict = checkBeforeModel(session, { text: turn.text, confidence: turn.confidence })
  session.strikes = verdict.strikes
  session.turnCount += 1

  const ledger: Ledger = { llmPaise: 0, tokensIn: 0, tokensOut: 0, smsPaise: 0 }
  let answer: Awaited<ReturnType<typeof respond>>
  try {
    answer = await respond(session, state, verdict, turn.text, ledger)
  } catch (error) {
    // A programmer error — an illegal transition, an id not from this session (design "Error
    // handling"): the call ends `failed`, logged with the call id only (CLAUDE.md: no PII).
    console.error(`[voice] call ${callId} failed: ${error instanceof Error ? error.message : 'unknown error'}`)
    await addCost(callId, ledger).catch(() => undefined)
    await close(session, state, { outcome: 'failed', reason: error instanceof Error ? error.name : 'error', transfer: false }).catch(() => undefined)
    throw error
  }

  await appendTurn(callId, {
    seq: seq + 1, speaker: 'ai', text: answer.reply, language: session.lang, toolCalls: answer.toolCalls,
    startedMs: arrivedMs, endedMs: elapsedMs(session),
  })
  // Every turn, zeros included: acceptance 5 wants a cost row on every call, and a call of
  // re-asks alone has no tokens to show for it.
  await addCost(callId, ledger)

  if (answer.closing) await close(session, state, answer.closing)
  return {
    reply: answer.reply,
    toolCalls: answer.toolCalls,
    ended: session.ended,
    ...(answer.closing ? { outcome: answer.closing.outcome } : {}),
    ...(state.orderId ? { orderId: state.orderId } : {}),
  }
}

/**
 * The guardrail verdict applied, then design "The turn" steps 2–3: the model with the tools,
 * every tool call executed by tools.ts, the results handed back, until the model answers in
 * prose. A transfer or end signal in a round is final: the model is asked once more for its
 * closing words, and nothing it asks for after the signal is executed.
 */
async function respond(
  session: Session,
  state: CallState,
  verdict: BeforeModelVerdict,
  text: string,
  ledger: Ledger,
): Promise<{ reply: string; toolCalls: ToolCallRecord[]; closing?: Closing }> {
  const lines = LINES[session.lang]
  switch (verdict.action) {
    case 'reask':
      return { reply: lines.reask, toolCalls: [] }
    case 'handoff':
      // The enum has its own value for the cap (Build Spec §4); the rest are `handoff` with the reason.
      return { reply: lines.transferring, toolCalls: [], closing: { outcome: verdict.reason === 'cap' ? 'cap_transfer' : 'handoff', reason: verdict.reason, transfer: true } }
    case 'end':
      return { reply: lines.ending, toolCalls: [], closing: { outcome: verdict.outcome, reason: verdict.reason, transfer: false } }
    case 'proceed':
      break
  }

  // CLAUDE.md: numbers stripped before caller text reaches a model.
  session.messages.push({ role: 'user', text: sanitiseCallerText(text) })
  // Rebuilt per turn: the language line follows the caller (§5.2) and the outlet card's clock
  // stays right on a long call. Cheap — a file read and some string joins.
  const system = buildSystemPrompt({
    restaurant: state.deps.restaurant, outlet: state.deps.outlet, profile: state.profile,
    lang: session.lang, now: new Date(), transport: session.transport,
  })

  const records: ToolCallRecord[] = []
  let reply: string | null = null
  let closing: Closing | undefined
  for (let round = 0; ; round++) {
    const response = await complete(session, { system, messages: session.messages, tools: TOOLS, maxTokens: 1024 }, ledger)
    if (!response) return { reply: lines.transferring, toolCalls: records, closing: { outcome: 'handoff', reason: 'vendor_error', transfer: true } }

    const execute = response.toolCalls.length > 0 && !closing && round < MAX_TOOL_ROUNDS
    // Calls that will not run are not recorded as asked: a real provider refuses the next request
    // if a tool call in the history has no result.
    session.messages.push({ role: 'assistant', text: response.text, toolCalls: execute ? response.toolCalls : [] })
    if (response.text) reply = response.text
    if (!execute) break

    const results: { id: string; name: string; result: unknown }[] = []
    for (const call of response.toolCalls) {
      const started = performance.now()
      const result = await runTool(call.name, call.args, session, state.deps)
      records.push({ name: call.name, args: call.args, result, ms: Math.round(performance.now() - started) })
      results.push({ id: call.id, name: call.name, result })
      closing ??= note(state, call.name, result, ledger)
    }
    session.messages.push({ role: 'tool', results })
  }
  return { reply: reply ?? lines.reask, toolCalls: records, closing }
}

/**
 * One model call under Build Spec §5.3's outage rule. The adapter either answers or throws;
 * guardrails.ts counts the strike and says retry, switch to the secondary, or hand off — this
 * is the failover the design puts "in loop.ts, not in the adapters". Null means hand off
 * `vendor_error`. A provider that is not configured counts as a failure too: the call must not
 * die on a missing secondary key, it must transfer.
 */
async function complete(session: Session, req: LlmRequest, ledger: Ledger): Promise<LlmResponse | null> {
  for (;;) {
    try {
      const response = await llm(session.provider).complete(req)
      ledger.llmPaise += costPaise(response.provider, response.usage)
      ledger.tokensIn += response.usage.tokensIn
      ledger.tokensOut += response.usage.tokensOut
      return response
    } catch (error) {
      const verdict = onLlmFailure(session)
      session.strikes = verdict.strikes
      // The message is the adapter's own (LlmError carries provider and status, never the body).
      console.warn(`[voice] call ${session.callId}: ${session.provider} model failed (${error instanceof Error ? error.message : 'unknown error'}) → ${verdict.action}`)
      if (verdict.action === 'handoff') return null
      if (verdict.action === 'switch') session.provider = verdict.provider
    }
  }
}

const placed = z.object({ orderId: z.string() })
const signal = z.object({ reason: z.string() })
const smsSent = z.object({ costPaise: z.number().int() })

/** What a successful tool result means for the call's record; a transfer or end signal comes back as the closing. */
function note(state: CallState, name: string, result: ToolResult, ledger: Ledger): Closing | undefined {
  if (!result.ok) return undefined
  switch (name) {
    case 'add_to_cart':
      state.ordered = true
      return undefined
    case 'answer_enquiry':
      state.enquired = true
      return undefined
    case 'send_sms':
      ledger.smsPaise += smsSent.parse(result.data).costPaise
      state.deflected = true
      return undefined
    case 'place_order':
      state.orderId = placed.parse(result.data).orderId
      return undefined
    case 'transfer_to_human':
      return { outcome: 'handoff', reason: signal.parse(result.data).reason, transfer: true }
    case 'end_call':
      return { outcome: endOutcome(state), reason: signal.parse(result.data).reason, transfer: false }
    default:
      return undefined
  }
}

/** An end the caller chose: `completed` if an order was placed, `deflected_sms` if the page link went out instead, else `abandoned`. */
const endOutcome = (state: CallState): Outcome => (state.orderId ? 'completed' : state.deflected ? 'deflected_sms' : 'abandoned')

const elapsedMs = (session: Session): number => Date.now() - session.startedAt.getTime()

// --- end -----------------------------------------------------------------------------------------

/**
 * The surface's own end — the browser hanging up, the mic page's silence timeout (design
 * "Guardrails"). Idempotent: a call the loop has already closed is a no-op, and calls.ts's
 * compare-and-set protects the first outcome if two ends race past this check.
 */
export async function endCall(callId: string, reason: string): Promise<void> {
  const session = getSession(callId)
  const state = calls.get(callId)
  if (!session || !state || session.ended) return
  await close(session, state, { outcome: endOutcome(state), reason, transfer: false })
}

/** Build Spec §5.2 post-call: the parked order on a transfer, then outcome, intent, duration and the allowance flag. */
async function close(session: Session, state: CallState, closing: Closing): Promise<void> {
  session.ended = true
  // Not when an order was already placed: the cart is not cleared by place_order, and the counter
  // has that order — the call row links it below.
  if (closing.transfer && session.cart.length > 0 && !state.orderId) await parkOrder(session, state, closing.reason)
  try {
    await finishCall(session.callId, {
      outcome: closing.outcome,
      handoffReason: closing.reason,
      intent: state.ordered ? 'order' : state.enquired ? 'enquiry' : 'unknown',
      languageDetected: session.lang,
      orderId: state.orderId ?? undefined,
      durationSec: Math.round(elapsedMs(session) / 1000),
      // Ideation §10 via the design's text reading: answered by the AI and at least two caller turns.
      countsTowardAllowance: session.turnCount >= 2,
    })
  } finally {
    deleteSession(session.callId)
    calls.delete(session.callId)
  }
}

/**
 * Design "Handoff without a telephone": what the caller built is not lost. The order is created
 * the one way an order is created from a cart — `placeOrder` — then parked `needs_attention`,
 * which pins it on the counter board (Ideation §8 flow 6) for a person to complete or cancel.
 * Pickup, because no address was confirmed; cash where the outlet takes it, so no payment link
 * chases a customer a person is about to speak to. The reason is on `call.handoff_reason` and,
 * as `notes`, on the card itself, so the counter sees why without opening the call.
 *
 * ponytail: it also sends the usual confirmation SMS, which a parked order does not strictly
 * deserve — one line in place-order.ts when it matters.
 */
async function parkOrder(session: Session, state: CallState, reason: string): Promise<void> {
  const { deps } = state
  const caller = deps.customer ? await getCustomer(deps.customer.id) : null
  if (!caller) return // no identity to attach an order to; the transcript still has the cart
  const result = await placeOrder({
    restaurant: deps.restaurant,
    outlet: deps.outlet,
    customer: caller,
    lang: session.lang,
    context: {
      kind: 'call', fulfilment: 'pickup', callId: session.callId, code: session.codeText ?? undefined,
      notes: `AI call handed off (${reason.replaceAll('_', ' ')}). Call the customer back to complete the order.`,
    },
    items: session.cart,
    paymentMethod: deps.outlet.codEnabled ? 'cod' : 'upi_link',
    origin: deps.origin,
  })
  if (!result.ok) {
    // A refusal here (the restaurant suspended mid-call, the menu unpublished) is not a
    // programmer error; the handoff still happens, without a parked order.
    console.warn(`[voice] call ${session.callId}: handoff order not created (${result.reason})`)
    return
  }
  await transitionOrder(result.orderId, 'needs_attention', AI)
  state.orderId = result.orderId
}
