/**
 * The loop driven end to end by the scripted model (M2 design "Testing": "loop.test.ts drives
 * the loop with the mock LLM through the acceptance conversations and asserts the tool calls
 * and the resulting rows"). One temp PGlite, one outlet with a small menu, a code, a new caller
 * with no consent and a returning one with consent, a saved address and a usual order.
 *
 * What the mock says is mock.ts's script; what these tests pin is the loop's record of it —
 * the `call` row, its turns with tool calls, the cost row, the order — and the side effects a
 * signal carries: a handoff parks the cart, an end classifies the outcome, an outage fails over.
 */

import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, afterEach, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { eq } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/pglite/migrator'
import type { LlmResponse } from '../adapters/llm/index.ts'
import { NOTICE_VERSION } from '../core/consent.ts'
import { hashPhone } from '../core/phone.ts'

// A fresh database per run; client.ts reads DATABASE_URL on first import (commerce.test.ts).
process.env.DATABASE_URL = `file://${mkdtempSync(join(tmpdir(), 'serveline-voice-loop-'))}`
process.env.VENDOR_MODE = 'mock'
process.env.LLM_PRIMARY_PROVIDER = 'mock'
process.env.LLM_SECONDARY_PROVIDER = 'mock'

const { db, schema } = await import('../db/client.ts')
const repos = await import('../db/repos/index.ts')
const { SYSTEM } = await import('../db/repos/_actor.ts')
const { mockInbox } = await import('../adapters/sms/mock.ts')
const { mockLlmAdapter } = await import('../adapters/llm/mock.ts')
const { toAnthropicMessages } = await import('../adapters/llm/anthropic.ts')
const { getSession } = await import('./session.ts')
const { spokenNotice } = await import('./notice.ts')
const { startCall, takeTurn, endCall } = await import('./loop.ts')

await migrate(db, { migrationsFolder: fileURLToPath(new URL('../db/migrations', import.meta.url)) })
after(() => db.$client.close())

// --- fixture -------------------------------------------------------------------------------------

const PEPPER = 'test-pepper'
const ORIGIN = 'http://localhost:3000'
const one = <T>(rows: T[]): T => {
  const row = rows[0]
  assert.ok(row)
  return row
}

const restaurant = one(await db.insert(schema.restaurant).values({ name: 'Udupi Grand', slug: 'udupi-grand' }).returning())
const outlet = one(await db.insert(schema.outlet).values({
  restaurantId: restaurant.id, name: 'Indiranagar', addressLine: '100 Feet Road', area: 'Indiranagar', pincode: '560038',
  hours: { mon: [['07:00', '22:00']], tue: [['07:00', '22:00']], wed: [['07:00', '22:00']], thu: [['07:00', '22:00']], fri: [['07:00', '22:00']], sat: [['07:00', '22:00']], sun: [['08:00', '15:00']] },
  serviceablePincodes: ['560038'], codEnabled: true,
}).returning())
const menu = one(await db.insert(schema.menu).values({ outletId: outlet.id, version: 1, publishedAt: new Date() }).returning())
const tiffin = one(await db.insert(schema.menuCategory).values({ menuId: menu.id, name: 'Tiffin' }).returning())
const item = async (name: string, pricePaise: number) =>
  one(await db.insert(schema.menuItem).values({ menuId: menu.id, categoryId: tiffin.id, name, pricePaise }).returning())
const masalaDosa = await item('Masala Dosa', 12000)
const coffee = await item('Filter Coffee', 3000)
await item('Idli', 5000)
const biryani = await item('Chicken Biryani', 24000)
const half = one(await db.insert(schema.itemVariant).values({ itemId: biryani.id, name: 'Half', priceDeltaPaise: -8000 }).returning())
await db.insert(schema.itemVariant).values({ itemId: biryani.id, name: 'Full', priceDeltaPaise: 0 })
await db.insert(schema.discountCode).values({ restaurantId: restaurant.id, code: 'FRESH20', kind: 'manual', percent: 20 })

// A new caller: identity only, no consent — the prompt must say nothing about them.
const phoneB = '+919876543211'
const bala = await repos.upsertCustomer({ phone: phoneB, phoneHash: hashPhone(phoneB, PEPPER) }, SYSTEM)

// A caller who never agrees: used only to prove that a handoff parks nothing without consent.
const phoneC = '+919876543212'
const chetan = await repos.upsertCustomer({ phone: phoneC, phoneHash: hashPhone(phoneC, PEPPER) }, SYSTEM)

// A returning caller: consent for fulfilment and history, a name, a saved address, a usual order.
const phoneA = '+919876543210'
const anitaId = (await repos.upsertCustomer({ phone: phoneA, phoneHash: hashPhone(phoneA, PEPPER) }, SYSTEM)).id
await repos.recordConsent({
  customerId: anitaId, restaurantId: restaurant.id, noticeVersion: NOTICE_VERSION,
  purposes: ['order_fulfilment', 'order_history'], channel: 'page', language: 'en', evidence: {},
}, SYSTEM)
const anita = await repos.upsertCustomer({ phone: phoneA, phoneHash: hashPhone(phoneA, PEPPER), name: 'Anita Rao', restaurantId: restaurant.id }, SYSTEM)
const home = await repos.saveAddress({
  customerId: anita.id, restaurantId: restaurant.id, label: 'Home', line1: '12 Cross', area: 'Indiranagar',
  pincode: '560038', source: 'page', isConfirmed: true,
}, SYSTEM)
await repos.upsertCustomerRestaurant({
  customerId: anita.id, restaurantId: restaurant.id, source: 'page', firstChannel: 'page_delivery',
  order: {
    totalPaise: 27000, placedAt: new Date(),
    usualOrder: { items: [
      { itemId: masalaDosa.id, optionIds: [], qty: 2, name: 'Masala Dosa' },
      { itemId: coffee.id, optionIds: [], qty: 1, name: 'Filter Coffee' },
    ] },
  },
}, SYSTEM)

const names = (r: Awaited<ReturnType<typeof takeTurn>>) => r.toolCalls.map((c) => c.name)
const okCalls = (r: Awaited<ReturnType<typeof takeTurn>>, name: string) =>
  r.toolCalls.filter((c) => c.name === name && (c.result as { ok: boolean }).ok)

/**
 * The scripted model, scripted exactly: one canned response per model call, the last repeating.
 * For the orderings mock.ts's policy never produces on its own — a tool call batched with the
 * notice, a tool call after a closing signal, a turn that never stops asking for tools.
 */
async function withScript<T>(script: Partial<LlmResponse>[], run: () => Promise<T>): Promise<T> {
  const scripted = mockLlmAdapter.complete
  let i = 0
  mockLlmAdapter.complete = async () => ({
    text: null, toolCalls: [], usage: { tokensIn: 1, tokensOut: 1 }, provider: 'mock', model: 'scripted-test',
    ...script[Math.min(i++, script.length - 1)],
  })
  try {
    return await run()
  } finally {
    mockLlmAdapter.complete = scripted
  }
}

const LLM_VARS = ['LLM_PRIMARY_PROVIDER', 'LLM_SECONDARY_PROVIDER'] as const
afterEach(() => {
  for (const v of LLM_VARS) process.env[v] = 'mock'
})

// --- the acceptance conversations ----------------------------------------------------------------

describe('a three-item Hindi order with a variant (acceptance 1, 5)', () => {
  it('ends in place_order; the call has its turns with tool calls, a cost row and the order', async () => {
    const started = await startCall({ outletId: outlet.id, transport: 'browser', customerId: bala.id, lang: 'hi', origin: ORIGIN })
    assert.equal(started.lang, 'hi')
    assert.match(started.greeting, /नमस्ते, Udupi Grand/)
    assert.doesNotMatch(started.greeting, /पिछली बार/, 'a caller with no consent is not offered a usual order')

    // CLAUDE.md: the number is stripped before the model sees the text; the transcript keeps it.
    const t1 = await takeTurn(started.callId, { text: 'do masala dosa, mera number 98765 43210 hai', lang: 'hi', confidence: 0.92 })
    assert.deepEqual(names(t1), ['search_menu', 'add_to_cart'])
    assert.equal((t1.toolCalls[1]?.args as { qty: number }).qty, 2)
    assert.match(t1.reply, /जोड़ दिया/)
    assert.equal(t1.ended, false)
    const live = getSession(started.callId)
    assert.ok(live)
    const firstUser = live.messages[0]
    assert.ok(firstUser?.role === 'user' && firstUser.text.includes('[number]') && !firstUser.text.includes('98765'))

    const t2 = await takeTurn(started.callId, { text: 'ek aadha chicken biryani', lang: 'hi' })
    assert.deepEqual(names(t2), ['search_menu', 'add_to_cart'])
    assert.equal((t2.toolCalls[1]?.args as { variant_id?: string }).variant_id, half.id)

    const t3 = await takeTurn(started.callId, { text: 'aur ek filter coffee', lang: 'hi' })
    assert.equal(okCalls(t3, 'add_to_cart').length, 1)
    assert.equal(live.cart.length, 3)

    const t4 = await takeTurn(started.callId, { text: 'bas', lang: 'hi' })
    assert.deepEqual(names(t4), ['get_cart'])
    assert.match(t4.reply, /आपका ऑर्डर/)

    mockInbox.clear()
    // Build Spec §10: this caller has never agreed to anything, so the first place_order is
    // refused and the assistant reads the spoken notice instead.
    const t5 = await takeTurn(started.callId, { text: 'pickup', lang: 'hi' })
    assert.deepEqual(names(t5), ['place_order'])
    assert.equal(t5.orderId, undefined, 'no order without consent')
    assert.match(t5.reply, /ऑर्डर लेने से पहले/, 'the notice is read, in the caller\'s language')
    assert.equal(t5.ended, false)

    const t5b = await takeTurn(started.callId, { text: 'haan, theek hai', lang: 'hi' })
    assert.deepEqual(names(t5b), ['record_consent', 'place_order'])
    assert.ok(t5b.orderId, 'the yes records consent and the order follows')
    assert.ok(mockInbox.list().some((m) => m.kind === 'payment_link'), 'the payment link is in the mock SMS inbox')

    const consent = await repos.getConsent(bala.id, restaurant.id)
    assert.ok(consent)
    assert.deepEqual(
      [consent.channel, consent.noticeVersion, consent.language, [...consent.purposes].sort()],
      ['call', NOTICE_VERSION, 'hi', ['order_fulfilment', 'order_history']],
    )
    assert.equal((consent.evidence as { callId?: string }).callId, started.callId, 'the call is the evidence')

    const t6 = await takeTurn(started.callId, { text: 'bye', lang: 'hi' })
    assert.deepEqual(names(t6), ['end_call'])
    assert.deepEqual([t6.ended, t6.outcome, t6.orderId], [true, 'completed', t5b.orderId])
    assert.equal(getSession(started.callId), null, 'the session is gone once the call ends')

    const order = await repos.getOrder(t5b.orderId)
    assert.ok(order)
    assert.deepEqual(
      [order.channel, order.fulfilment, order.callId, order.customerId, order.paymentMethod, order.status, order.totalPaise],
      ['ai_call', 'pickup', started.callId, bala.id, 'upi_link', 'awaiting_payment', 12000 * 2 + 16000 + 3000],
    )
    assert.deepEqual(order.items.map((i) => [i.nameSnapshot, i.qty]), [['Masala Dosa', 2], ['Chicken Biryani — Half', 1], ['Filter Coffee', 1]])

    const call = await repos.getCall(started.callId)
    assert.ok(call)
    assert.deepEqual(
      [call.outcome, call.intent, call.orderId, call.languageDetected, call.countsTowardAllowance, call.transport, call.customerId],
      ['completed', 'order', order.id, 'hi', true, 'browser', bala.id],
    )
    assert.equal(call.fromPhoneHash, bala.phoneHash)
    assert.equal(typeof call.durationSec, 'number')
    assert.ok(call.endedAt)
    // The greeting is 0, then customer/ai pairs: 1 + 7 × 2 — the consent answer is a turn like any other.
    assert.equal(call.turns.length, 15)
    assert.deepEqual(call.turns.slice(0, 3).map((t) => [t.seq, t.speaker]), [[0, 'ai'], [1, 'customer'], [2, 'ai']])
    assert.equal(call.turns[0]?.text, started.greeting)
    // CLAUDE.md: call_turn is not one of the four tables that may hold a phone number, so the
    // stored transcript carries the same sanitised text the model saw (review S7).
    assert.equal(call.turns[1]?.text, 'do masala dosa, mera number [number] hai')
    assert.equal(call.turns[1]?.asrConfidence, 0.92)
    const recorded = call.turns[2]?.toolCalls as { name: string; args: unknown; result: unknown; ms: number }[]
    assert.deepEqual(recorded.map((c) => c.name), ['search_menu', 'add_to_cart'])
    assert.ok(recorded.every((c) => typeof c.ms === 'number' && c.result !== undefined))
    assert.ok(call.cost && call.cost.tokensIn > 0 && call.cost.tokensOut > 0, 'a cost row with the usage')
    assert.equal(call.cost.llmPaise, 0, 'the mock model is priced at zero')
    // Build Spec §4 `call_cost.sms_paise`: the payment link and the confirmation this call sent are
    // its cost, and were missing from the ledger until the bug hunt (call-cost-misses-the-sms).
    assert.ok(call.cost.smsPaise > 0, 'the SMS the call sent is on the call ledger')
    assert.equal(call.cost.totalPaise, call.cost.llmPaise + call.cost.smsPaise, 'the total is the sum of its parts')

    // Idempotent: a hang-up after the loop closed the call is a no-op, and a turn is refused.
    await endCall(started.callId, 'hangup')
    await assert.rejects(takeTurn(started.callId, { text: 'hello' }), /not live/)
  })
})

describe('"I want to talk to someone" (acceptance 2)', () => {
  it('ends the call with a handoff and parks the cart as a needs_attention order', async () => {
    const before = await repos.getCustomerRestaurant(anita.id, restaurant.id)
    const started = await startCall({ outletId: outlet.id, transport: 'browser', customerPhoneHash: anita.phoneHash, origin: ORIGIN })
    assert.equal(started.lang, 'en')
    const t1 = await takeTurn(started.callId, { text: 'one masala dosa' })
    assert.equal(okCalls(t1, 'add_to_cart').length, 1)

    mockInbox.clear()
    const t2 = await takeTurn(started.callId, { text: 'I want to talk to someone' })
    assert.deepEqual(names(t2), ['transfer_to_human'])
    assert.deepEqual([t2.ended, t2.outcome], [true, 'handoff'])
    assert.match(t2.reply, /Connecting you to the restaurant/)
    assert.ok(t2.orderId, 'the cart became an order')

    const order = await repos.getOrder(t2.orderId)
    assert.ok(order)
    assert.deepEqual(
      [order.status, order.channel, order.fulfilment, order.callId, order.customerId],
      ['needs_attention', 'ai_call', 'pickup', started.callId, anita.id],
    )
    assert.deepEqual(order.items.map((i) => [i.nameSnapshot, i.qty]), [['Masala Dosa', 1]])
    assert.deepEqual(order.events.map((e) => e.toStatus), ['received', 'needs_attention'])
    assert.equal(order.notes, 'AI call handed off (customer request). Call the customer back to complete the order.')

    // A parked order is not a placed one (review S4): nobody is asked to pay for it, nobody is
    // told it is confirmed, and it does not become the caller's "same as last time".
    assert.deepEqual(mockInbox.list().map((m) => m.kind), [])
    const after = await repos.getCustomerRestaurant(anita.id, restaurant.id)
    assert.deepEqual(after?.usualOrder, before?.usualOrder, 'the usual order is untouched by a parked order')

    const call = await repos.getCall(started.callId)
    assert.ok(call)
    assert.deepEqual([call.outcome, call.handoffReason, call.intent, call.orderId], ['handoff', 'customer_request', 'order', order.id])
    assert.ok(call.cost)
  })

  // Build Spec §10: placeOrder writes a profile row, so a caller who never agreed gets no order —
  // the handoff still happens, and the transcript keeps the cart for the counter.
  it('parks nothing for a caller who has not agreed to the notice', async () => {
    const started = await startCall({ outletId: outlet.id, transport: 'browser', customerId: chetan.id, origin: ORIGIN })
    const t1 = await takeTurn(started.callId, { text: 'one masala dosa' })
    assert.equal(okCalls(t1, 'add_to_cart').length, 1)

    const t2 = await takeTurn(started.callId, { text: 'I want to talk to someone' })
    assert.deepEqual([t2.ended, t2.outcome, t2.orderId], [true, 'handoff', undefined])
    const call = await repos.getCall(started.callId)
    assert.deepEqual([call?.outcome, call?.orderId], ['handoff', null])
    assert.equal(await repos.getConsent(chetan.id, restaurant.id), null, 'nothing was recorded on their behalf')
  })

  it('a handoff with an empty cart parks nothing', async () => {
    const started = await startCall({ outletId: outlet.id, transport: 'browser', customerId: bala.id, origin: ORIGIN })
    const t1 = await takeTurn(started.callId, { text: 'can I speak to the manager' })
    assert.deepEqual([t1.ended, t1.outcome, t1.orderId], [true, 'handoff', undefined])
    const call = await repos.getCall(started.callId)
    assert.deepEqual([call?.outcome, call?.orderId, call?.intent, call?.countsTowardAllowance], ['handoff', null, 'unknown', false])
  })
})

describe('the returning customer (acceptance 4)', () => {
  it('is greeted with the usual order and "yes … delivery" places it within 3 turns', async () => {
    const started = await startCall({ outletId: outlet.id, transport: 'browser', customerPhoneHash: anita.phoneHash, origin: ORIGIN })
    assert.match(started.greeting, /Hello Anita, welcome back to Udupi Grand/)
    assert.match(started.greeting, /Same as last time — 2 Masala Dosa, 1 Filter Coffee, ₹270\?/)
    assert.doesNotMatch(started.greeting, /12 Cross|98765/, 'no address line and no number')

    const t1 = await takeTurn(started.callId, { text: 'yes', confidence: 0.95 })
    const adds = okCalls(t1, 'add_to_cart')
    assert.deepEqual(adds.map((c) => (c.args as { item_id: string; qty: number }).qty), [2, 1])
    assert.deepEqual(adds.map((c) => (c.args as { item_id: string }).item_id), [masalaDosa.id, coffee.id])
    assert.match(t1.reply, /Anything else/)
    assert.equal(t1.ended, false)

    // Build Spec §5.2: the saved label is confirmed before the order, so delivery is
    // use_saved_address then place_order — the loop no longer pre-sets an address (review S3).
    const t2 = await takeTurn(started.callId, { text: 'delivery please' })
    assert.deepEqual(names(t2), ['use_saved_address', 'place_order'])
    assert.ok(t2.orderId, 'placed on the second turn')
    assert.match(t2.reply, /order is placed/)

    const order = await repos.getOrder(t2.orderId)
    assert.ok(order)
    assert.deepEqual(
      [order.fulfilment, order.addressId, order.addressStatus, order.paymentMethod, order.status, order.totalPaise, order.customerId],
      ['delivery', home.id, 'confirmed', 'upi_link', 'awaiting_payment', 27000, anita.id],
    )
    assert.deepEqual(order.items.map((i) => [i.nameSnapshot, i.qty]), [['Masala Dosa', 2], ['Filter Coffee', 1]])

    const t3 = await takeTurn(started.callId, { text: 'thanks, bye' })
    assert.deepEqual([t3.ended, t3.outcome], [true, 'completed'])
    const call = await repos.getCall(started.callId)
    assert.deepEqual([call?.customerId, call?.orderId, call?.intent], [anita.id, order.id, 'order'])
  })
})

describe('guardrails before the model (Build Spec §5.3)', () => {
  it('two low-confidence turns re-ask without the model; two abusive turns end the call', async () => {
    const started = await startCall({ outletId: outlet.id, transport: 'browser', customerId: bala.id, origin: ORIGIN })
    const t1 = await takeTurn(started.callId, { text: 'mmm', confidence: 0.2 })
    assert.equal(t1.ended, false)
    const t2 = await takeTurn(started.callId, { text: 'hmm', confidence: 0.3 })
    assert.deepEqual([t2.reply, t2.toolCalls, t2.ended], ["Sorry, I didn't catch that. Could you say it again?", [], false])

    const t3 = await takeTurn(started.callId, { text: 'you bastard', confidence: 0.9 })
    assert.equal(t3.ended, false, 'one abusive turn is a strike, not the end')
    const t4 = await takeTurn(started.callId, { text: 'bastard, hurry up' })
    assert.deepEqual([t4.ended, t4.outcome, t4.toolCalls], [true, 'abandoned', []])
    assert.match(t4.reply, /ending this call/)

    const call = await repos.getCall(started.callId)
    assert.ok(call)
    assert.deepEqual([call.outcome, call.handoffReason, call.countsTowardAllowance, call.orderId], ['abandoned', 'abuse', true, null])
    // 1 greeting + 4 caller turns × 2: the re-ask and the ending are recorded like any reply.
    assert.equal(call.turns.length, 9)
    assert.equal(call.turns[4]?.text, t2.reply)
    assert.ok(call.cost, 'a cost row even for a call the model barely saw')
  })
})

describe('outage (acceptance 6)', () => {
  it('a primary that throws twice hands the turn to the secondary; both failing transfers vendor_error', async () => {
    process.env.LLM_PRIMARY_PROVIDER = 'failing'
    process.env.LLM_SECONDARY_PROVIDER = 'mock'
    const a = await startCall({ outletId: outlet.id, transport: 'browser', customerId: bala.id, origin: ORIGIN })
    const t1 = await takeTurn(a.callId, { text: 'one filter coffee' })
    const session = getSession(a.callId)
    assert.ok(session)
    assert.deepEqual([session.provider, session.strikes.llmFailures], ['secondary', 2])
    assert.equal(okCalls(t1, 'add_to_cart').length, 1, 'the secondary answered the same turn')
    assert.equal(t1.ended, false)
    const t2 = await takeTurn(a.callId, { text: 'bye' })
    assert.deepEqual([t2.ended, t2.outcome, session.strikes.llmFailures], [true, 'abandoned', 2])

    process.env.LLM_SECONDARY_PROVIDER = 'failing'
    const b = await startCall({ outletId: outlet.id, transport: 'browser', customerId: bala.id, origin: ORIGIN })
    const t3 = await takeTurn(b.callId, { text: 'one filter coffee' })
    assert.deepEqual([t3.ended, t3.outcome, t3.toolCalls, t3.orderId], [true, 'handoff', [], undefined])
    assert.match(t3.reply, /Connecting you to the restaurant/)
    const call = await repos.getCall(b.callId)
    assert.deepEqual([call?.outcome, call?.handoffReason, call?.orderId], ['handoff', 'vendor_error', null])
  })
})

describe('consent needs an answer (Build Spec §10, ADR 0005)', () => {
  // consent-recorded-without-an-answer: Gemini routinely batches prose with a tool call, so one
  // response can read the notice aloud and record agreement to it in the same breath. The caller
  // was never given a turn to answer, and the transcript proves it.
  it('refuses a record_consent batched with the notice, and records the yes on the next turn', async () => {
    const phoneD = '+919876543213'
    const deepa = await repos.upsertCustomer({ phone: phoneD, phoneHash: hashPhone(phoneD, PEPPER) }, SYSTEM)
    const started = await startCall({ outletId: outlet.id, transport: 'browser', customerId: deepa.id, origin: ORIGIN })

    const notice = spokenNotice('en', restaurant.name)
    const t1 = await withScript(
      [
        { text: notice, toolCalls: [{ id: 'same-breath', name: 'record_consent', args: { agreed: true } }] },
        { text: 'Shall I go ahead?' },
      ],
      () => takeTurn(started.callId, { text: 'one masala dosa please' }),
    )
    assert.deepEqual(t1.toolCalls.map((c) => [c.name, c.result]), [['record_consent', { ok: false, reason: 'notice_not_read' }]])
    assert.equal(await repos.getConsent(deepa.id, restaurant.id), null, 'nobody can agree to words they were only just read')

    // The caller speaks, and the same tool call now records — the notice went out a turn earlier.
    const t2 = await withScript(
      [{ toolCalls: [{ id: 'answered', name: 'record_consent', args: { agreed: true } }] }, { text: 'Thank you.' }],
      () => takeTurn(started.callId, { text: 'yes, that is fine' }),
    )
    assert.deepEqual(t2.toolCalls.map((c) => c.result), [{ ok: true, data: { agreed: true } }])
    const consent = await repos.getConsent(deepa.id, restaurant.id)
    assert.equal(consent?.channel, 'call')
    await endCall(started.callId, 'hangup')
  })
})

describe('a closing signal ends the round (M2 design "The turn")', () => {
  // closing-short-circuits-tool-bookkeeping: the tools after the signal used to run with their
  // bookkeeping dropped — an order cooked and paid for that the call record never heard of.
  it('executes nothing the model asks for after end_call in the same batch', async () => {
    const started = await startCall({ outletId: outlet.id, transport: 'browser', customerPhoneHash: anita.phoneHash, origin: ORIGIN })
    const t1 = await takeTurn(started.callId, { text: 'one masala dosa' })
    assert.equal(okCalls(t1, 'add_to_cart').length, 1)

    mockInbox.clear()
    const t2 = await withScript(
      [
        {
          toolCalls: [
            { id: 'bye', name: 'end_call', args: { reason: 'customer_done' } },
            { id: 'late', name: 'place_order', args: { fulfilment: 'pickup', payment_method: 'upi_link' } },
          ],
        },
        { text: 'Goodbye!' },
      ],
      () => takeTurn(started.callId, { text: 'that is all, bye' }),
    )
    assert.deepEqual(
      t2.toolCalls.map((c) => [c.name, c.result]),
      [['end_call', { ok: true, data: { action: 'end', reason: 'customer_done' } }], ['place_order', { ok: false, reason: 'call_ended' }]],
      'the late call is refused, with a result of its own so the next request is not rejected',
    )
    assert.deepEqual([t2.ended, t2.outcome, t2.orderId], [true, 'abandoned', undefined])
    assert.deepEqual(mockInbox.list().map((m) => m.kind), [], 'nothing is texted to a caller who has hung up')

    const orders = await db.select().from(schema.order).where(eq(schema.order.callId, started.callId))
    assert.deepEqual(orders, [], 'no order was created after the caller ended the call')
    const call = await repos.getCall(started.callId)
    assert.deepEqual([call?.outcome, call?.orderId], ['abandoned', null], 'the record and the world agree')
  })
})

describe('the tool-round cap (M2 design "The turn", step 3)', () => {
  // empty-assistant-turn-after-round-cap: an assistant turn with neither text nor tool calls is
  // rejected by the Anthropic Messages API on every later turn, which would kill the Build Spec
  // §3 failover for the rest of the call.
  it('records what the caller actually heard, never a content-less assistant turn', async () => {
    const started = await startCall({ outletId: outlet.id, transport: 'browser', customerId: bala.id, origin: ORIGIN })
    const t = await withScript(
      Array.from({ length: 6 }, (_, i) => ({ toolCalls: [{ id: `round-${i}`, name: 'get_cart', args: {} }] })),
      () => takeTurn(started.callId, { text: 'what is in my order' }),
    )
    assert.equal(t.reply, "Sorry, I didn't catch that. Could you say it again?")
    assert.equal(t.toolCalls.length, 4, 'four rounds, then the answer is taken as it is')

    const live = getSession(started.callId)
    assert.ok(live)
    const empty = live.messages.filter((m) => m.role === 'assistant' && m.text === null && m.toolCalls.length === 0)
    assert.deepEqual(empty, [], 'the turn carries the line that was spoken')
    assert.ok(toAnthropicMessages(live.messages).every((m) => m.content.length > 0), 'and maps to no empty Anthropic message')
    await endCall(started.callId, 'hangup')
  })
})
