/**
 * The ordering page's order path against a real PGlite and the seeded demo restaurant — the
 * in-process half of Build Spec §14 M1 criteria 1, 2, 4 and 5: a delivery order from a scanned
 * card with the code applied, paid through the mock gateway's webhook; a second redemption by
 * the same phone refused; a table-context order carrying its table number.
 */

import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { eq } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { NOTICE_VERSION } from '../core/consent.ts'
import { hashPhone } from '../core/phone.ts'

process.env.DATABASE_URL = `file://${mkdtempSync(join(tmpdir(), 'serveline-checkout-'))}`
process.env.VENDOR_MODE = 'mock'
process.env.PHONE_HASH_PEPPER ??= 'test-pepper' // secrets.ts derives one only under `next dev`
// placeOrder signs the address link for a delivery the customer has not confirmed (Build Spec §5.2).
process.env.SESSION_SECRET ??= 'test-session-secret'

const { db, schema } = await import('../db/client.ts')
const { seed } = await import('../db/seed.ts')
const repos = await import('../db/repos/index.ts')
const { phonePepper } = await import('../auth/secrets.ts')
const { issuePaymentLink, placeOrder, resolveCode } = await import('./place-order.ts')
const { mockPayments } = await import('../adapters/payments/mock.ts')
const { mockInbox } = await import('../adapters/sms/mock.ts')
const { payments } = await import('../adapters/payments/index.ts')

await migrate(db, { migrationsFolder: fileURLToPath(new URL('../db/migrations', import.meta.url)) })
assert.equal(await seed(db), 'seeded')
after(() => db.$client.close())

const restaurant = (await repos.getRestaurantBySlug('demo'))!
const outlet = restaurant.outlets[0]!
const menu = (await repos.getPublishedMenu(outlet.id))!
const itemByName = (name: string) => menu.items.find((i) => i.name === name)!
const asCustomer = (id: string) => ({ type: 'customer' as const, id })

/** A brand-new customer with a page consent and one saved address, as the checkout creates them. */
async function newCustomer(phone: string) {
  const phoneHash = hashPhone(phone, phonePepper())
  const c = await repos.upsertCustomer({ phone, phoneHash, preferredLanguage: 'en' }, { type: 'customer', id: null })
  const consent = await repos.recordConsent({
    customerId: c.id, restaurantId: restaurant.id, noticeVersion: NOTICE_VERSION,
    purposes: ['order_fulfilment', 'order_history', 'personalisation'], channel: 'page', language: 'en',
    evidence: { requestId: 'test', ipHash: 'x' },
  }, asCustomer(c.id))
  const address = await repos.saveAddress({
    customerId: c.id, restaurantId: restaurant.id, line1: '1 Test Road', area: 'Koramangala',
    pincode: '560095', source: 'page', isConfirmed: true,
  }, asCustomer(c.id))
  return { customer: c, consent, address }
}

const base = { restaurant, outlet, lang: 'en' as const, origin: 'http://localhost:3000' }

describe('placeOrder', () => {
  it('table context: a dine_in order carrying the table number, paid at the table, SMS sent', async () => {
    const { customer } = await newCustomer('+919900000101')
    mockInbox.clear()
    const result = await placeOrder({
      ...base, customer,
      context: { kind: 'table', tableNo: '7' },
      items: [{ itemId: itemByName('Idli Vada').id, optionIds: [], qty: 2 }],
      paymentMethod: 'pay_at_table',
    })
    assert.ok(result.ok, JSON.stringify(result))
    const order = (await repos.getOrder(result.orderId))!
    assert.equal(order.fulfilment, 'dine_in')
    assert.equal(order.tableNo, '7')
    assert.equal(order.channel, 'page_table')
    assert.equal(order.status, 'received')
    assert.equal(order.paymentMethod, 'pay_at_table')
    assert.equal(order.totalPaise, 2 * itemByName('Idli Vada').pricePaise)
    assert.equal(result.paymentUrl, null)
    assert.equal(mockInbox.list()[0]?.kind, 'order_confirm')
    const logged = await db.select().from(schema.smsMessage).where(eq(schema.smsMessage.toPhoneHash, customer.phoneHash))
    assert.equal(logged.length, 1)
    assert.equal(logged[0]?.kind, 'order_confirm')
  })

  it('delivery from a scanned card: 10% applied, redemption recorded, UPI link, webhook confirms', async () => {
    const { customer, address } = await newCustomer('+919900000102')
    const items = [
      { itemId: itemByName('Masala Dosa').id, optionIds: [], qty: 1 },
      { itemId: itemByName('Idli Vada').id, optionIds: [], qty: 1 },
    ]
    const result = await placeOrder({
      ...base, customer,
      context: { kind: 'delivery', code: 'welcome10' },
      items, paymentMethod: 'upi_link', addressId: address.id,
    })
    assert.ok(result.ok, JSON.stringify(result))
    assert.match(result.paymentUrl ?? '', /^\/mock\/pay\/plink_mock_/)

    const order = (await repos.getOrder(result.orderId))!
    const subtotal = itemByName('Masala Dosa').pricePaise + itemByName('Idli Vada').pricePaise
    assert.equal(order.subtotalPaise, subtotal)
    assert.equal(order.discountPaise, Math.ceil(subtotal * 0.1))
    assert.equal(order.status, 'awaiting_payment')
    assert.equal(order.paymentStatus, 'awaiting')
    assert.equal(order.addressStatus, 'confirmed')
    assert.equal(order.payments.length, 1)

    const redemptions = await db.select().from(schema.codeRedemption).where(eq(schema.codeRedemption.orderId, order.id))
    assert.equal(redemptions.length, 1)
    assert.equal(redemptions[0]?.kind, 'win_back_card')

    // The profile counts the order (order_history consent) and attributes it to the card.
    const profile = (await repos.getCustomerRestaurant(customer.id, restaurant.id))!
    assert.equal(profile.source, 'win_back')
    assert.equal(profile.orderCount, 1)
    assert.equal(profile.ltvPaise, order.totalPaise)

    // The mock gateway's signed webhook goes through the real verify → parse → markPaid path.
    const linkId = result.paymentUrl!.slice('/mock/pay/'.length)
    const { rawBody, signature } = mockPayments.markPaid(linkId)
    assert.ok(payments().verifyWebhook(rawBody, signature))
    const event = payments().parseWebhook(rawBody)
    const paid = await repos.markPaid(event.linkId, event.paymentId, event.amountPaise, JSON.parse(rawBody))
    assert.deepEqual(paid, { ok: true, orderId: order.id, alreadyPaid: false })
    assert.equal((await repos.getOrder(order.id))!.status, 'confirmed')
    assert.equal((await repos.getOrder(order.id))!.paymentStatus, 'paid')

    // A gateway retry is idempotent.
    const again = await repos.markPaid(event.linkId, event.paymentId, event.amountPaise, JSON.parse(rawBody))
    assert.deepEqual(again, { ok: true, orderId: order.id, alreadyPaid: true })
  })

  it('refuses a second redemption by the same phone, across batches, and says why', async () => {
    const { customer, address } = await newCustomer('+919900000103')
    const first = await placeOrder({
      ...base, customer, context: { kind: 'delivery', code: 'WELCOME10' },
      items: [{ itemId: itemByName('Idli Vada').id, optionIds: [], qty: 1 }],
      paymentMethod: 'cod', addressId: address.id,
    })
    assert.ok(first.ok)
    assert.equal((await repos.getOrder(first.orderId))!.status, 'confirmed') // COD confirms at once

    // Same code, and the second batch's code: both refused per restaurant, not per code.
    for (const code of ['WELCOME10', 'WELCOME10B']) {
      const outcome = await resolveCode(restaurant.id, code, customer.id)
      assert.deepEqual(outcome, { ok: false, reason: 'already_redeemed', code })
      const second = await placeOrder({
        ...base, customer, context: { kind: 'delivery', code },
        items: [{ itemId: itemByName('Idli Vada').id, optionIds: [], qty: 1 }],
        paymentMethod: 'cod', addressId: address.id,
      })
      assert.ok(!second.ok)
      assert.equal(second.reason, 'code_refused')
      assert.equal(second.code?.reason, 'already_redeemed')
    }
    assert.equal((await resolveCode(restaurant.id, 'NOPE', customer.id)).ok, false)
  })

  it('prices from ids only and refuses what the menu does not sell', async () => {
    const { customer, address } = await newCustomer('+919900000104')
    const soldOut = itemByName('Khara Bath')
    await repos.setItemAvailability(soldOut.id, false, { type: 'staff', id: null })
    const r = await placeOrder({
      ...base, customer, context: { kind: 'delivery' },
      items: [{ itemId: soldOut.id, optionIds: [], qty: 1 }], paymentMethod: 'cod', addressId: address.id,
    })
    assert.deepEqual(r, { ok: false, reason: 'unknown_item' })

    const biryani = itemByName('Chicken Donne Biryani')
    const missingRequired = await placeOrder({
      ...base, customer, context: { kind: 'delivery' },
      items: [{ itemId: biryani.id, optionIds: [], qty: 1 }], paymentMethod: 'cod', addressId: address.id,
    })
    assert.deepEqual(missingRequired, { ok: false, reason: 'min_select' })

    const wrongMethod = await placeOrder({
      ...base, customer, context: { kind: 'table', tableNo: '2' },
      items: [{ itemId: itemByName('Idli Vada').id, optionIds: [], qty: 1 }], paymentMethod: 'cod',
    })
    assert.deepEqual(wrongMethod, { ok: false, reason: 'bad_payment_method' })

    const noAddress = await placeOrder({
      ...base, customer, context: { kind: 'delivery' },
      items: [{ itemId: itemByName('Idli Vada').id, optionIds: [], qty: 1 }], paymentMethod: 'cod',
      addressId: '00000000-0000-0000-0000-000000000000',
    })
    assert.deepEqual(noAddress, { ok: false, reason: 'address_required' })
  })

  it('call context: a pickup order on channel ai_call, linked to its call, with no address', async () => {
    const { customer } = await newCustomer('+919900000105')
    const call = await repos.createCall({ outletId: outlet.id, transport: 'browser', customerId: customer.id })
    const items = [{ itemId: itemByName('Idli Vada').id, optionIds: [], qty: 1 }]
    const result = await placeOrder({
      ...base, customer,
      context: { kind: 'call', fulfilment: 'pickup', callId: call.id },
      items, paymentMethod: 'cod',
    })
    assert.ok(result.ok, JSON.stringify(result))
    const order = (await repos.getOrder(result.orderId))!
    assert.equal(order.channel, 'ai_call')
    assert.equal(order.fulfilment, 'pickup')
    assert.equal(order.callId, call.id)
    assert.equal(order.addressId, null)
    assert.equal(order.addressStatus, 'na')
    assert.equal(order.tableNo, null)
    assert.equal(order.status, 'confirmed') // COD confirms at once, as on the page
    assert.equal((await repos.getCustomerRestaurant(customer.id, restaurant.id))!.source, 'organic_call')

    // Delivery by voice still needs a saved address the caller owns.
    const noAddress = await placeOrder({
      ...base, customer, context: { kind: 'call', fulfilment: 'delivery', callId: call.id }, items, paymentMethod: 'cod',
    })
    assert.deepEqual(noAddress, { ok: false, reason: 'address_required' })
  })
})

// Build Spec §5.2 and Ideation §8: "Indian addresses do not survive a phone call."
describe('a delivery to an address the customer has not confirmed', () => {
  /** What `capture_rough_address` leaves behind: what was said, stored unconfirmed. */
  async function roughOrder(line1: string) {
    const { customer } = await newCustomer(`+9199000${Math.floor(Math.random() * 90000 + 10000)}`)
    const call = (await db.insert(schema.call).values({ outletId: outlet.id, transport: 'browser', customerId: customer.id }).returning())[0]!
    const rough = await repos.saveAddress({
      customerId: customer.id, restaurantId: restaurant.id,
      label: 'Spoken address', line1, area: 'Koramangala', pincode: '560095',
      source: 'voice_rough', isConfirmed: false,
    }, asCustomer(customer.id))
    mockInbox.clear()
    const result = await placeOrder({
      ...base,
      customer,
      context: { kind: 'call', fulfilment: 'delivery', callId: call.id },
      items: [{ itemId: itemByName('Masala Dosa').id, optionIds: [], qty: 1 }],
      paymentMethod: 'upi_link',
      addressId: rough.id,
    })
    assert.ok(result.ok, JSON.stringify(result))
    return { customer, rough, orderId: result.orderId }
  }

  it('waits as address_pending, sends the link, and bills nobody', async () => {
    const { rough, orderId } = await roughOrder('Indiranagar, near the metro')
    const order = await repos.getOrder(orderId)
    assert.ok(order)
    assert.deepEqual([order.status, order.addressStatus, order.addressId], ['address_pending', 'pending', rough.id])
    assert.deepEqual(order.events.map((e) => e.toStatus), ['received', 'address_pending'])

    // The link is the only message: nobody is told the order is confirmed, and nobody is asked to
    // pay for a delivery to an address no one has checked.
    assert.deepEqual(mockInbox.list().map((m) => m.kind), ['address_link'])
    assert.match(mockInbox.list()[0]!.text, new RegExp(`/r/${restaurant.slug}/address/`))
    assert.equal(order.payments.length, 0, 'no payment link while the address is unknown')
    assert.equal(order.paymentStatus, 'unpaid')
  })

  it('moves on and bills once the customer confirms', async () => {
    const { customer, orderId } = await roughOrder('Indiranagar, near the park')
    const confirmed = await repos.saveAddress({
      customerId: customer.id, restaurantId: restaurant.id,
      line1: '12 Cross', area: 'Koramangala', pincode: '560095', source: 'page', isConfirmed: true,
    }, asCustomer(customer.id))
    await repos.confirmAddress(orderId, confirmed.id, asCustomer(customer.id))

    const order = await repos.getOrder(orderId)
    assert.ok(order)
    assert.deepEqual([order.status, order.addressStatus, order.addressId], ['confirmed', 'confirmed', confirmed.id])

    mockInbox.clear()
    const url = await issuePaymentLink({
      order: { id: order.id, totalPaise: order.totalPaise, paymentMethod: order.paymentMethod, paymentStatus: order.paymentStatus },
      restaurant: { id: restaurant.id, name: restaurant.name },
      customer: { phone: customer.phone, phoneHash: customer.phoneHash },
      lang: 'en', origin: base.origin, actor: asCustomer(customer.id),
    })
    assert.ok(url)
    assert.deepEqual(mockInbox.list().map((m) => m.kind), ['payment_link'])
    assert.equal((await repos.getOrder(orderId))?.payments.length, 1)
  })

  it('issues nothing for cash on delivery or an order already paid', async () => {
    const { customer, orderId } = await roughOrder('Indiranagar, by the shops')
    const order = (await repos.getOrder(orderId))!
    const target = {
      restaurant: { id: restaurant.id, name: restaurant.name },
      customer: { phone: customer.phone, phoneHash: customer.phoneHash },
      lang: 'en' as const, origin: base.origin, actor: asCustomer(customer.id),
    }
    assert.equal(await issuePaymentLink({ ...target, order: { id: order.id, totalPaise: order.totalPaise, paymentMethod: 'cod', paymentStatus: 'unpaid' } }), null)
    assert.equal(await issuePaymentLink({ ...target, order: { id: order.id, totalPaise: order.totalPaise, paymentMethod: 'upi_link', paymentStatus: 'paid' } }), null)
  })
})
