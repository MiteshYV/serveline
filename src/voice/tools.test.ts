/**
 * The tool handlers against a real PGlite (M2 design, "Testing": each tool handler against a temp
 * database), plus the one structural check: the zod mirror in tools.ts is exactly the JSON Schema
 * in contracts/voice-tools.json, so the model is validated against what it was shown.
 */

import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { eq } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { z } from 'zod'
import contract from '../../contracts/voice-tools.json' with { type: 'json' }
import { priceCart } from '../core/cart.ts'
import { NOTICE_VERSION } from '../core/consent.ts'
import { paise } from '../core/money.ts'
import { hashPhone } from '../core/phone.ts'

// A fresh database per run; client.ts reads DATABASE_URL on first import (commerce.test.ts).
process.env.DATABASE_URL = `file://${mkdtempSync(join(tmpdir(), 'serveline-voice-tools-'))}`
process.env.VENDOR_MODE = 'mock'

const { db, schema } = await import('../db/client.ts')
const repos = await import('../db/repos/index.ts')
const { SYSTEM } = await import('../db/repos/_actor.ts')
const { mockInbox } = await import('../adapters/sms/mock.ts')
const { createSession, deleteSession, getSession } = await import('./session.ts')
const { runTool, TOOL_NAMES, TOOL_SCHEMAS } = await import('./tools.ts')
const { noticeWasRead, spokenNotice } = await import('./notice.ts')

await migrate(db, { migrationsFolder: fileURLToPath(new URL('../db/migrations', import.meta.url)) })
after(() => db.$client.close())

// --- fixture: one outlet, a small menu, two customers, one call ----------------------------------

const PEPPER = 'test-pepper'
const one = <T>(rows: T[]): T => {
  const row = rows[0]
  assert.ok(row)
  return row
}

const restaurant = one(await db.insert(schema.restaurant).values({ name: 'Udupi Grand', slug: 'udupi-grand' }).returning())
const outlet = one(await db.insert(schema.outlet).values({
  restaurantId: restaurant.id, name: 'Indiranagar', addressLine: '100 Feet Road', area: 'Indiranagar', pincode: '560038',
  hours: { mon: [['07:00', '22:00']], sun: [] }, serviceablePincodes: ['560038'], codEnabled: true,
}).returning())
const menu = one(await db.insert(schema.menu).values({ outletId: outlet.id, version: 1, publishedAt: new Date() }).returning())
const tiffin = one(await db.insert(schema.menuCategory).values({ menuId: menu.id, name: 'Tiffin' }).returning())
const item = async (name: string, pricePaise: number) =>
  one(await db.insert(schema.menuItem).values({ menuId: menu.id, categoryId: tiffin.id, name, pricePaise }).returning())
const masalaDosa = await item('Masala Dosa', 12000)
await item('Rava Dosa', 11000)
await item('Set Dosa', 9000)
await item('Filter Coffee', 3000)
const biryani = await item('Chicken Biryani', 24000)
const half = one(await db.insert(schema.itemVariant).values({ itemId: biryani.id, name: 'Half', priceDeltaPaise: -8000 }).returning())
const raitaGroup = one(await db.insert(schema.itemOptionGroup).values({ itemId: biryani.id, name: 'Add raita' }).returning())
const raita = one(await db.insert(schema.itemOption).values({ groupId: raitaGroup.id, name: 'Boondi raita', priceDeltaPaise: 4000 }).returning())

const phoneA = '+919876543210'
const anita = await repos.upsertCustomer({ phone: phoneA, phoneHash: hashPhone(phoneA, PEPPER) }, SYSTEM)
await repos.recordConsent({
  customerId: anita.id, restaurantId: restaurant.id, noticeVersion: NOTICE_VERSION,
  purposes: ['order_fulfilment', 'order_history'], channel: 'call', language: 'en', evidence: {},
}, SYSTEM)
const home = await repos.saveAddress({
  customerId: anita.id, restaurantId: restaurant.id, label: 'Home', line1: '12 Cross', area: 'Indiranagar',
  pincode: '560038', source: 'page', isConfirmed: true,
}, SYSTEM)
const phoneB = '+919876543211'
const bala = await repos.upsertCustomer({ phone: phoneB, phoneHash: hashPhone(phoneB, PEPPER) }, SYSTEM) // no consent

const asAnita = { customer: { id: anita.id, phoneHash: anita.phoneHash }, restaurant, outlet, origin: 'http://localhost:3000' }
const asBala = { ...asAnita, customer: { id: bala.id, phoneHash: bala.phoneHash } }
const anonymous = { ...asAnita, customer: null }

/** A new call row (order.call_id references it) and its session. */
async function newCall(customerId: string | null = anita.id) {
  const call = one(await db.insert(schema.call).values({ outletId: outlet.id, transport: 'browser', customerId }).returning())
  return createSession({ callId: call.id, outletId: outlet.id, restaurantId: restaurant.id, transport: 'browser', customerId })
}

type Item = { id: string; name: string; priceRupees: string; pricePaise: number; variants: { id: string }[]; optionGroups: { id: string; options: { id: string }[] }[] }
type Summary = { lines: { lineId: string; name: string; variant: string | null; options: string[]; qty: number; linePaise: number; lineRupees: string }[]; totalPaise: number; discountPaise: number; totalRupees: string; code: string | null }

const data = <T>(result: Awaited<ReturnType<typeof runTool>>): T => {
  assert.ok(result.ok, JSON.stringify(result))
  return result.data as T
}

// --- the contract --------------------------------------------------------------------------------

const withoutDescriptions = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(withoutDescriptions)
    : value && typeof value === 'object'
      ? Object.fromEntries(Object.entries(value).filter(([k]) => k !== 'description').map(([k, v]) => [k, withoutDescriptions(v)]))
      : value

describe('contracts/voice-tools.json', () => {
  it('names exactly the tools that have handlers, and each schema is the zod mirror', () => {
    assert.equal(contract.version, 1)
    assert.deepEqual(contract.tools.map((t) => t.name).sort(), [...TOOL_NAMES].sort())
    for (const tool of contract.tools) {
      assert.ok(tool.description.length > 20, `${tool.name} has a description for the model`)
      const { $schema: _draft, ...mirror } = z.toJSONSchema(TOOL_SCHEMAS[tool.name as keyof typeof TOOL_SCHEMAS])
      assert.deepEqual(withoutDescriptions(tool.parameters), mirror, `${tool.name} parameters match tools.ts`)
    }
  })
})

// --- handlers ------------------------------------------------------------------------------------

describe('search_menu', () => {
  it('finds "masala dosa" from "masla dosa" and records what it showed', async () => {
    const s = await newCall()
    const { items } = data<{ items: Item[] }>(await runTool('search_menu', { query: 'masla dosa', language: 'en' }, s, asAnita))
    assert.equal(items[0]?.name, 'Masala Dosa')
    assert.deepEqual([items[0]?.priceRupees, items[0]?.pricePaise], ['120', 12000])
    assert.ok(items.length <= 6)
    assert.ok(items.every((i) => /dosa/i.test(i.name)), 'every match is a dosa')
    assert.ok(s.seenItemIds.has(masalaDosa.id) && s.searchResults.has(masalaDosa.id))
    assert.ok(!s.seenItemIds.has(biryani.id))

    const found = data<{ items: Item[] }>(await runTool('search_menu', { query: 'chicken biriyani', language: 'hi' }, s, asAnita))
    assert.equal(found.items[0]?.id, biryani.id)
    assert.equal(found.items[0]?.variants[0]?.id, half.id)
    assert.equal(found.items[0]?.optionGroups[0]?.options[0]?.id, raita.id)

    assert.deepEqual(data(await runTool('search_menu', { query: 'pizza', language: 'en' }, s, asAnita)), { items: [] })
  })
})

describe('cart', () => {
  it('add_to_cart refuses an unseen id and a wrong option, then prices a good line', async () => {
    const s = await newCall()
    assert.deepEqual(await runTool('add_to_cart', { item_id: masalaDosa.id, qty: 1 }, s, asAnita), { ok: false, reason: 'item_not_searched' })

    await runTool('search_menu', { query: 'biryani', language: 'en' }, s, asAnita)
    assert.deepEqual(
      await runTool('add_to_cart', { item_id: biryani.id, option_ids: [masalaDosa.id], qty: 1 }, s, asAnita),
      { ok: false, reason: 'unknown_option' },
    )
    assert.deepEqual(await runTool('add_to_cart', { item_id: biryani.id, variant_id: 'nope', qty: 1 }, s, asAnita), { ok: false, reason: 'unknown_variant' })
    assert.equal((await runTool('add_to_cart', { item_id: biryani.id, qty: 0 }, s, asAnita)).ok, false)
    assert.deepEqual(s.cart, [], 'nothing refused reached the cart')

    const cart = data<Summary>(await runTool('add_to_cart', { item_id: biryani.id, variant_id: half.id, option_ids: [raita.id], qty: 2 }, s, asAnita))
    assert.deepEqual(cart.lines, [{
      lineId: 'line-1', name: 'Chicken Biryani', variant: 'Half', options: ['Boondi raita'], qty: 2, linePaise: 40000, lineRupees: '400',
    }])
    assert.deepEqual([cart.totalPaise, cart.totalRupees, cart.code], [40000, '400', null])

    assert.equal(data<Summary>(await runTool('get_cart', {}, s, asAnita)).totalPaise, 40000)
    assert.deepEqual(await runTool('remove_from_cart', { line_id: 'line-9' }, s, asAnita), { ok: false, reason: 'unknown_line' })
    assert.deepEqual(data<Summary>(await runTool('remove_from_cart', { line_id: 'line-1' }, s, asAnita)).lines, [])
  })
})

describe('apply_code', () => {
  it('refuses a used code and an unknown one, and a fresh one discounts the cart', async () => {
    const [used, fresh] = await db.insert(schema.discountCode).values([
      { restaurantId: restaurant.id, code: 'WELCOME10', kind: 'manual', percent: 10 },
      { restaurantId: restaurant.id, code: 'FRESH20', kind: 'manual', percent: 20 },
    ]).returning()
    assert.ok(used && fresh)
    const inputs = [{ itemId: masalaDosa.id, optionIds: [], qty: 1 }]
    const priced = [{ id: masalaDosa.id, name: masalaDosa.name, pricePaise: paise(masalaDosa.pricePaise), variants: [], optionGroups: [] }]
    const earlier = await repos.createOrder({
      restaurantId: restaurant.id, outletId: outlet.id, channel: 'page_delivery', fulfilment: 'delivery', customerId: anita.id,
      paymentMethod: 'cod', cart: priceCart(inputs, priced), inputs,
    }, SYSTEM)
    assert.ok((await repos.recordRedemption({ code: used, customerId: anita.id, orderId: earlier.id, channel: 'page_delivery' }, SYSTEM)).ok)

    const s = await newCall()
    assert.deepEqual(await runTool('apply_code', { code: 'welcome10' }, s, asAnita), { ok: false, reason: 'already_redeemed' })
    assert.deepEqual(await runTool('apply_code', { code: 'NOPE' }, s, asAnita), { ok: false, reason: 'not_found' })
    assert.equal(s.codeText, null)

    await runTool('search_menu', { query: 'masala dosa', language: 'en' }, s, asAnita)
    await runTool('add_to_cart', { item_id: masalaDosa.id, qty: 1 }, s, asAnita)
    const applied = data<{ code: string; percent: number }>(await runTool('apply_code', { code: 'fresh20' }, s, asAnita))
    assert.deepEqual([applied.code, applied.percent, s.codeText], ['FRESH20', 20, 'FRESH20'])
    const cart = data<Summary>(await runTool('get_cart', {}, s, asAnita))
    assert.deepEqual([cart.code, cart.discountPaise, cart.totalPaise], ['FRESH20', 2400, 9600])
  })
})

describe('check_serviceability', () => {
  it('answers by pincode or area from the outlet', async () => {
    const s = await newCall()
    assert.deepEqual(await runTool('check_serviceability', { pincode: '560 038' }, s, asAnita), { ok: true, data: { serviceable: true } })
    assert.deepEqual(await runTool('check_serviceability', { pincode: '560001' }, s, asAnita), { ok: false, reason: 'pincode_not_served' })
    assert.deepEqual(await runTool('check_serviceability', { area: 'indiranagar' }, s, asAnita), { ok: true, data: { serviceable: true } })
    assert.deepEqual(await runTool('check_serviceability', {}, s, asAnita), { ok: false, reason: 'no_location_given' })
  })
})

describe('addresses', () => {
  it('use_saved_address takes only the caller\'s own ids and returns the label, never the line', async () => {
    const s = await newCall()
    assert.deepEqual(await runTool('use_saved_address', { address_id: home.id }, s, asAnita), { ok: true, data: { addressId: home.id, label: 'Home' } })
    assert.equal(s.addressId, home.id)
    assert.deepEqual(await runTool('use_saved_address', { address_id: home.id }, s, asBala), { ok: false, reason: 'unknown_address' })
    assert.deepEqual(await runTool('use_saved_address', { address_id: home.id }, s, anonymous), { ok: false, reason: 'customer_required' })
  })

  it('capture_rough_address needs consent, then stores an unconfirmed voice_rough row', async () => {
    const s = await newCall()
    const text = 'Indiranagar 12th main, near the metro'
    assert.deepEqual(await runTool('capture_rough_address', { text }, s, asBala), { ok: false, reason: 'consent_required' })
    assert.deepEqual(await runTool('capture_rough_address', { text }, s, anonymous), { ok: false, reason: 'customer_required' })

    const saved = data<{ addressId: string; label: string }>(await runTool('capture_rough_address', { text }, s, asAnita))
    // Build Spec §10: the label reaches the prompt and the tool result, so it is never the spoken
    // line — that goes to line1, which nothing reads back to the model.
    assert.equal(saved.label, 'Spoken address')
    assert.notEqual(saved.label, text)
    assert.equal(s.addressId, saved.addressId)
    const row = one(await db.select().from(schema.customerAddress).where(eq(schema.customerAddress.id, saved.addressId)))
    assert.deepEqual([row.source, row.isConfirmed, row.customerId, row.label, row.line1], ['voice_rough', false, anita.id, 'Spoken address', text])
  })
})

describe('send_sms', () => {
  it('texts the ordering page link and logs it by hash; the payment link is place_order\'s', async () => {
    const s = await newCall()
    mockInbox.clear()
    const sent = data<{ sent: boolean; costPaise: number }>(await runTool('send_sms', { kind: 'page_link' }, s, asAnita))
    assert.ok(sent.sent && sent.costPaise > 0)
    const message = mockInbox.list()[0]
    assert.equal(message?.kind, 'page_link')
    assert.ok(message?.text.includes('http://localhost:3000/r/udupi-grand'))
    const logged = await db.select().from(schema.smsMessage).where(eq(schema.smsMessage.toPhoneHash, anita.phoneHash))
    assert.deepEqual(logged.map((l) => [l.kind, l.status]), [['page_link', 'sent']])

    assert.deepEqual(await runTool('send_sms', { kind: 'payment_link' }, s, asAnita), { ok: false, reason: 'use_place_order' })
    assert.deepEqual(await runTool('send_sms', { kind: 'page_link' }, s, anonymous), { ok: false, reason: 'customer_required' })
  })
})

describe('place_order', () => {
  it('pickup creates an ai_call order linked to the call', async () => {
    const s = await newCall()
    assert.deepEqual(await runTool('place_order', { fulfilment: 'pickup', payment_method: 'cod' }, s, asAnita), { ok: false, reason: 'empty_cart' })

    await runTool('search_menu', { query: 'masala dosa', language: 'hi' }, s, asAnita)
    await runTool('add_to_cart', { item_id: masalaDosa.id, qty: 2 }, s, asAnita)
    assert.deepEqual(await runTool('place_order', { fulfilment: 'delivery', payment_method: 'cod' }, s, asAnita), { ok: false, reason: 'address_required' })

    mockInbox.clear()
    const placed = data<{ orderId: string; totalPaise: number; totalRupees: string; paymentLinkSent: boolean; statusUrl: string }>(
      await runTool('place_order', { fulfilment: 'pickup', payment_method: 'cod' }, s, asAnita),
    )
    assert.deepEqual([placed.totalPaise, placed.totalRupees, placed.paymentLinkSent], [24000, '240', false])
    assert.equal(placed.statusUrl, `http://localhost:3000/r/udupi-grand/order/${placed.orderId}`)

    const order = (await repos.getOrder(placed.orderId))!
    assert.deepEqual(
      [order.channel, order.fulfilment, order.callId, order.customerId, order.status, order.paymentMethod, order.addressStatus],
      ['ai_call', 'pickup', s.callId, anita.id, 'confirmed', 'cod', 'na'],
    )
    assert.deepEqual(order.items.map((i) => [i.nameSnapshot, i.qty]), [['Masala Dosa', 2]])
    assert.equal(mockInbox.list()[0]?.kind, 'order_confirm')
  })

  it('delivery by UPI link to a saved address sends the payment link', async () => {
    const s = await newCall()
    const [coffee] = data<{ items: Item[] }>(await runTool('search_menu', { query: 'filter coffee', language: 'en' }, s, asAnita)).items
    assert.ok(coffee)
    await runTool('add_to_cart', { item_id: coffee.id, qty: 1 }, s, asAnita)
    await runTool('use_saved_address', { address_id: home.id }, s, asAnita)
    mockInbox.clear()
    const placed = data<{ orderId: string; paymentLinkSent: boolean }>(await runTool('place_order', { fulfilment: 'delivery', payment_method: 'upi_link' }, s, asAnita))
    assert.equal(placed.paymentLinkSent, true)
    const order = (await repos.getOrder(placed.orderId))!
    assert.deepEqual([order.fulfilment, order.addressId, order.status], ['delivery', home.id, 'awaiting_payment'])
    assert.ok(mockInbox.list().some((m) => m.kind === 'payment_link'))
  })
})

describe('answer_enquiry', () => {
  it('reads from the outlet row', async () => {
    const s = await newCall()
    const text = async (kind: string) => data<{ text: string }>(await runTool('answer_enquiry', { kind }, s, asAnita)).text
    assert.equal(await text('hours'), 'mon: 07:00-22:00; sun: closed.')
    assert.equal(await text('address'), '100 Feet Road, Indiranagar, 560038.')
    assert.match(await text('delivery'), /560038.*Cash on delivery/)
    assert.match(await text('menu'), /http:\/\/localhost:3000\/r\/udupi-grand/)
  })
})

describe('signals, validation and the session store', () => {
  it('transfer and end only signal; unknown tools and bad arguments are results, not throws', async () => {
    const s = await newCall()
    assert.deepEqual(await runTool('transfer_to_human', { reason: 'asked for a person' }, s, asAnita), { ok: true, data: { action: 'transfer', reason: 'asked for a person' } })
    assert.deepEqual(await runTool('end_call', { reason: 'order placed' }, s, asAnita), { ok: true, data: { action: 'end', reason: 'order placed' } })
    assert.deepEqual(await runTool('make_tea', {}, s, asAnita), { ok: false, reason: 'unknown_tool' })
    const bad = await runTool('search_menu', { query: '' }, s, asAnita)
    assert.ok(!bad.ok && bad.reason === 'invalid_args' && Array.isArray(bad.detail) && bad.detail.length === 2, JSON.stringify(bad))
    assert.equal((await runTool('get_cart', undefined, s, asAnita)).ok, true, 'no arguments is an empty object')

    assert.equal(getSession(s.callId), s)
    deleteSession(s.callId)
    assert.equal(getSession(s.callId), null)
  })
})

describe('record_consent (Build Spec §10, ADR 0005)', () => {
  it('refuses until the notice has actually been read out', async () => {
    const s = await newCall(bala.id)
    // Nothing has been said yet, so there is nothing the caller could have agreed to.
    assert.deepEqual(await runTool('record_consent', { agreed: true }, s, asBala), { ok: false, reason: 'notice_not_read' })
    assert.equal(await repos.getConsent(bala.id, restaurant.id), null)

    // The loop sets this when the reply carries the notice word for word.
    s.noticeRead = true
    assert.deepEqual(await runTool('record_consent', { agreed: true }, s, asBala), { ok: true, data: { agreed: true } })
    const consent = await repos.getConsent(bala.id, restaurant.id)
    assert.ok(consent)
    assert.deepEqual(
      [consent.channel, consent.noticeVersion, [...consent.purposes].sort()],
      ['call', NOTICE_VERSION, ['order_fulfilment', 'order_history']],
    )
    assert.equal((consent.evidence as { callId?: string }).callId, s.callId)
  })

  it('records nothing for a no, and needs an identity', async () => {
    const s = await newCall(bala.id)
    s.noticeRead = true
    assert.deepEqual(await runTool('record_consent', { agreed: false }, s, asBala), { ok: true, data: { agreed: false } })
    assert.deepEqual(await runTool('record_consent', { agreed: true }, s, anonymous), { ok: false, reason: 'customer_required' })
  })
})

describe('noticeWasRead', () => {
  it('accepts the notice read word for word and refuses a paraphrase', () => {
    const spoken = spokenNotice('en', restaurant.name)
    assert.equal(noticeWasRead(spoken, 'en', restaurant.name), true)
    // Whitespace is the model's to choose; the words are not.
    assert.equal(noticeWasRead(`  ${spoken.replace(/ /g, '  ')}  `, 'en', restaurant.name), true)
    assert.equal(noticeWasRead('Is it alright if we keep your details?', 'en', restaurant.name), false)
    assert.equal(noticeWasRead(spoken.slice(0, 60), 'en', restaurant.name), false)
  })
})
