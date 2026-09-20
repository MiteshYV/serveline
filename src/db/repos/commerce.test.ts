/**
 * Integration test for the commerce repos — customers, orders, codes — against a real PGlite,
 * not a mock (M1 design, "Testing"). The two unique indexes on `code_redemption` are the point
 * of half of it: they are exercised by inserting twice, never by a pre-check.
 */

import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { count, eq, sql } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { priceCart, type PricedMenuItem } from '../../core/cart.ts'
import { paise } from '../../core/money.ts'
import { NOTICE_VERSION } from '../../core/consent.ts'
import { IllegalTransitionError } from '../../core/orders.ts'
import { hashPhone } from '../../core/phone.ts'

// A fresh database per run. client.ts reads DATABASE_URL when first imported, and a static
// import would be hoisted above this line — hence the dynamic imports below.
process.env.DATABASE_URL = `file://${mkdtempSync(join(tmpdir(), 'serveline-commerce-'))}`

const { db, schema } = await import('../client.ts')
const customers = await import('./customers.ts')
const orders = await import('./orders.ts')
const codes = await import('./codes.ts')
const { SYSTEM } = await import('./_actor.ts')

await migrate(db, { migrationsFolder: fileURLToPath(new URL('../migrations', import.meta.url)) })
after(() => db.$client.close())

// --- fixture ------------------------------------------------------------------------------

const PEPPER = 'test-pepper'

const [restaurant] = await db.insert(schema.restaurant)
  .values({ name: 'Udupi Grand', slug: 'udupi-grand' }).returning()
assert.ok(restaurant)
const [otherRestaurant] = await db.insert(schema.restaurant)
  .values({ name: 'Nagarjuna', slug: 'nagarjuna' }).returning()
assert.ok(otherRestaurant)

const [outlet] = await db.insert(schema.outlet).values({
  restaurantId: restaurant.id, name: 'Indiranagar', addressLine: '100 Feet Road',
  area: 'Indiranagar', pincode: '560038',
}).returning()
assert.ok(outlet)

const [owner] = await db.insert(schema.staffUser).values({
  restaurantId: restaurant.id, phone: '+919876500000', phoneHash: hashPhone('+919876500000', PEPPER),
  name: 'Owner', role: 'owner',
}).returning()
assert.ok(owner)
const asOwner = { type: 'staff' as const, id: owner.id }

const [menu] = await db.insert(schema.menu)
  .values({ outletId: outlet.id, version: 1, publishedAt: new Date(), publishedBy: owner.id }).returning()
assert.ok(menu)
const [mains] = await db.insert(schema.menuCategory).values({ menuId: menu.id, name: 'Mains' }).returning()
assert.ok(mains)
const [dosaRow] = await db.insert(schema.menuItem)
  .values({ menuId: menu.id, categoryId: mains.id, name: 'Masala Dosa', pricePaise: 12000, isVeg: true }).returning()
const [biryaniRow] = await db.insert(schema.menuItem)
  .values({ menuId: menu.id, categoryId: mains.id, name: 'Chicken Biryani', pricePaise: 24000 }).returning()
assert.ok(dosaRow && biryaniRow)
const [half] = await db.insert(schema.itemVariant)
  .values({ itemId: biryaniRow.id, name: 'Half', priceDeltaPaise: -8000 }).returning()
const [raitaGroup] = await db.insert(schema.itemOptionGroup)
  .values({ itemId: biryaniRow.id, name: 'Add raita' }).returning()
assert.ok(half && raitaGroup)
const [raita] = await db.insert(schema.itemOption)
  .values({ groupId: raitaGroup.id, name: 'Boondi raita', priceDeltaPaise: 4000 }).returning()
assert.ok(raita)

// The shape core prices; the catalog repo's toPricedMenu does this for the app.
const pricedMenu: PricedMenuItem[] = [
  { id: dosaRow.id, name: dosaRow.name, pricePaise: paise(dosaRow.pricePaise), variants: [], optionGroups: [] },
  {
    id: biryaniRow.id, name: biryaniRow.name, pricePaise: paise(biryaniRow.pricePaise),
    variants: [{ id: half.id, name: half.name, priceDeltaPaise: paise(half.priceDeltaPaise) }],
    optionGroups: [{
      id: raitaGroup.id, name: raitaGroup.name, minSelect: 0, maxSelect: 1,
      options: [{ id: raita.id, name: raita.name, priceDeltaPaise: paise(raita.priceDeltaPaise) }],
    }],
  },
]

const inputs = [
  { itemId: dosaRow.id, optionIds: [], qty: 2 },
  { itemId: biryaniRow.id, variantId: half.id, optionIds: [raita.id], qty: 1 },
]
// ₹240 + ₹200 = ₹440, 10% off → ₹396.
const cart = priceCart(inputs, pricedMenu, { percent: 10 })

const asCustomer = (id: string) => ({ type: 'customer' as const, id })

const phoneA = '+919876543210'
const anita = await customers.upsertCustomer(
  { phone: phoneA, phoneHash: hashPhone(phoneA, PEPPER), preferredLanguage: 'kn' },
  SYSTEM,
)
const phoneB = '+919876543211'
const bala = await customers.upsertCustomer({ phone: phoneB, phoneHash: hashPhone(phoneB, PEPPER) }, SYSTEM)

const anitaConsent = await customers.recordConsent({
  customerId: anita.id, restaurantId: restaurant.id, noticeVersion: NOTICE_VERSION,
  purposes: ['order_fulfilment', 'order_history'], channel: 'page', language: 'kn',
  evidence: { requestId: 'req-1' },
}, asCustomer(anita.id))

const placeOrder = (over: Partial<Parameters<typeof orders.createOrder>[0]> = {}) =>
  orders.createOrder({
    restaurantId: restaurant.id, outletId: outlet.id, channel: 'page_delivery', fulfilment: 'delivery',
    customerId: anita.id, paymentMethod: 'cod', cart, inputs, ...over,
  }, asCustomer(anita.id))

const auditCount = async (entity: string) => {
  const [row] = await db.select({ n: count() }).from(schema.auditLog).where(eq(schema.auditLog.entity, entity))
  return row?.n ?? 0
}

// --- customers ----------------------------------------------------------------------------

describe('customers', () => {
  it('upserts by phone hash, keeps stored fields when a later call omits them, and audits both', async () => {
    const again = await customers.upsertCustomer({ phone: phoneA, phoneHash: hashPhone(phoneA, PEPPER) }, SYSTEM)
    assert.equal(again.id, anita.id)
    assert.equal(again.preferredLanguage, 'kn')
    assert.equal(await customers.findCustomerByPhoneHash(hashPhone(phoneA, PEPPER)).then((c) => c?.id), anita.id)

    const audits = await db.select().from(schema.auditLog).where(eq(schema.auditLog.entity, 'customer'))
    assert.ok(audits.length >= 3)
    assert.ok(audits.every((a) => !JSON.stringify(a.after).includes(phoneA)), 'no phone number in audit_log')
  })

  it('refuses a name without a per-restaurant consent, and stores it once one exists', async () => {
    await assert.rejects(
      customers.upsertCustomer({ phone: phoneB, phoneHash: hashPhone(phoneB, PEPPER), name: 'Bala' }, SYSTEM),
      /consent/,
    )
    await assert.rejects(
      customers.upsertCustomer(
        { phone: phoneB, phoneHash: hashPhone(phoneB, PEPPER), name: 'Bala', restaurantId: restaurant.id },
        SYSTEM,
      ),
      /No valid consent/,
    )
    const named = await customers.upsertCustomer(
      { phone: phoneA, phoneHash: hashPhone(phoneA, PEPPER), name: 'Anita', restaurantId: restaurant.id },
      asCustomer(anita.id),
    )
    assert.equal(named.name, 'Anita')
  })

  it('gates an address on consent, and lists most recently used first', async () => {
    await assert.rejects(
      customers.saveAddress({
        customerId: bala.id, restaurantId: restaurant.id, line1: '12 Cross', source: 'page',
      }, asCustomer(bala.id)),
      /No valid consent/,
    )
    // Consent at one restaurant does not reach another (Build Spec §4).
    await assert.rejects(
      customers.saveAddress({
        customerId: anita.id, restaurantId: otherRestaurant.id, line1: '12 Cross', source: 'page',
      }, asCustomer(anita.id)),
      /No valid consent/,
    )

    const home = await customers.saveAddress({
      customerId: anita.id, restaurantId: restaurant.id, label: 'Home', line1: '12 Cross',
      landmark: 'Opp. temple', area: 'Indiranagar', pincode: '560038', source: 'page', isConfirmed: true,
    }, asCustomer(anita.id))
    const office = await customers.saveAddress({
      customerId: anita.id, restaurantId: restaurant.id, label: 'Office', line1: 'Tower B', source: 'page',
    }, asCustomer(anita.id))

    const [addressAudit] = await db.select().from(schema.auditLog)
      .where(eq(schema.auditLog.entityId, home.id))
    assert.ok(addressAudit && !JSON.stringify(addressAudit.after).includes('12 Cross'), 'no full address in audit_log')

    // Never used: newest first.
    assert.deepEqual((await customers.listAddresses(anita.id, restaurant.id)).map((a) => a.id), [office.id, home.id])
    // An order against Home makes it the most recently used.
    await placeOrder({ addressId: home.id })
    assert.deepEqual((await customers.listAddresses(anita.id, restaurant.id)).map((a) => a.id), [home.id, office.id])
  })

  it('creates the per-restaurant profile once and bumps it per order', async () => {
    const first = await customers.upsertCustomerRestaurant({
      customerId: anita.id, restaurantId: restaurant.id, source: 'win_back',
      firstChannel: 'page_delivery', consentId: anitaConsent.id,
    }, asCustomer(anita.id))
    assert.equal(first.orderCount, 0)
    assert.equal(first.consentId, anitaConsent.id)

    const usualOrder = { items: [{ itemId: dosaRow.id, optionIds: [], qty: 2, name: 'Masala Dosa' }] }
    const placedAt = new Date('2026-09-18T12:00:00Z')
    await customers.upsertCustomerRestaurant({
      customerId: anita.id, restaurantId: restaurant.id, source: 'page',
      order: { totalPaise: 39600, placedAt, usualOrder },
    }, SYSTEM)
    const second = await customers.upsertCustomerRestaurant({
      customerId: anita.id, restaurantId: restaurant.id, source: 'page',
      order: { totalPaise: 12000, placedAt: new Date('2026-09-19T12:00:00Z'), usualOrder },
    }, SYSTEM)

    assert.equal(second.source, 'win_back', 'source is how they first arrived, never overwritten')
    assert.equal(second.firstChannel, 'page_delivery')
    assert.equal(second.orderCount, 2)
    assert.equal(second.ltvPaise, 51600)
    assert.equal(second.lastOrderAt?.toISOString(), '2026-09-19T12:00:00.000Z')
    assert.deepEqual(second.usualOrder, usualOrder)

    // order_history is a purpose Bala never granted, so the bump is refused for him.
    await customers.recordConsent({
      customerId: bala.id, restaurantId: restaurant.id, noticeVersion: NOTICE_VERSION,
      purposes: ['order_fulfilment'], channel: 'page', language: 'en', evidence: {},
    }, asCustomer(bala.id))
    await assert.rejects(
      customers.upsertCustomerRestaurant({
        customerId: bala.id, restaurantId: restaurant.id, source: 'page',
        order: { totalPaise: 100, placedAt: new Date(), usualOrder: { items: [] } },
      }, SYSTEM),
      /order_history/,
    )
  })

  it('withdrawal closes the grant, and getConsent returns null afterwards', async () => {
    assert.ok(await customers.getConsent(bala.id, restaurant.id))
    assert.equal(await customers.withdrawConsent(bala.id, restaurant.id, asCustomer(bala.id)), 1)
    assert.equal(await customers.getConsent(bala.id, restaurant.id), null)
    assert.equal(await customers.withdrawConsent(bala.id, restaurant.id, asCustomer(bala.id)), 0)
  })

  it('a failed statement reports the SQLSTATE, never the query or its parameters', async () => {
    const ghost = '00000000-0000-4000-8000-000000000000'
    await assert.rejects(
      customers.upsertCustomerRestaurant({ customerId: ghost, restaurantId: restaurant.id, source: 'page' }, SYSTEM),
      (e: unknown) => e instanceof Error && e.message === 'customer_restaurant.upsert failed (23503)',
    )
  })
})

// --- orders -------------------------------------------------------------------------------

describe('createOrder', () => {
  it('writes the order, its items and the first event together, copying the cart verbatim', async () => {
    const created = await placeOrder({ discountCodeId: undefined })
    const full = await orders.getOrder(created.id)
    assert.ok(full)

    assert.equal(full.status, 'received')
    assert.equal(full.subtotalPaise, 44000)
    assert.equal(full.discountPaise, 4400)
    assert.equal(full.totalPaise, 39600)
    assert.equal(full.addressStatus, 'pending', 'delivery without an address id')

    assert.deepEqual(
      full.items.map((i) => [i.nameSnapshot, i.qty, i.unitPricePaise, i.variantId]),
      [
        ['Masala Dosa', 2, 12000, null],
        ['Chicken Biryani — Half + Boondi raita', 1, 20000, half.id],
      ],
    )
    assert.deepEqual(full.items[1]?.options, [{ id: raita.id, name: 'Boondi raita' }])

    assert.deepEqual(
      full.events.map((e) => [e.fromStatus, e.toStatus, e.actorType, e.actorId]),
      [[null, 'received', 'customer', anita.id]],
    )
    assert.ok((await auditCount('order')) >= 1)
  })

  it('is atomic: an item that cannot be written leaves no order behind', async () => {
    const [before] = await db.select({ n: count() }).from(schema.order)
    const ghost = '00000000-0000-4000-8000-000000000000'
    const ghostCart = priceCart(
      [{ itemId: ghost, optionIds: [], qty: 1 }],
      [{ id: ghost, name: 'Ghost', pricePaise: paise(100), variants: [], optionGroups: [] }],
    )
    await assert.rejects(placeOrder({ cart: ghostCart, inputs: [{ itemId: ghost, optionIds: [], qty: 1 }] }))
    const [afterwards] = await db.select({ n: count() }).from(schema.order)
    assert.equal(afterwards?.n, before?.n)
  })

  it('refuses a cart whose lines and inputs disagree', async () => {
    await assert.rejects(placeOrder({ inputs: inputs.slice(0, 1) }), /same list/)
  })

  it('carries the table number for a table-context order (Build Spec §14 M1)', async () => {
    const seated = await placeOrder({ channel: 'page_table', fulfilment: 'dine_in', tableNo: '7', paymentMethod: 'pay_at_table' })
    assert.equal(seated.tableNo, '7')
    assert.equal(seated.addressStatus, 'na')
  })
})

describe('transitionOrder', () => {
  it('refuses ready → delivered for delivery and allows it for dine_in', async () => {
    const delivery = await placeOrder()
    for (const to of ['confirmed', 'preparing', 'ready'] as const) await orders.transitionOrder(delivery.id, to, asOwner)
    await assert.rejects(orders.transitionOrder(delivery.id, 'delivered', asOwner), IllegalTransitionError)
    await orders.transitionOrder(delivery.id, 'out_for_delivery', asOwner)
    const done = await orders.transitionOrder(delivery.id, 'delivered', asOwner)
    assert.equal(done.status, 'delivered')
    assert.ok(done.confirmedAt && done.deliveredAt)

    const seated = await placeOrder({ channel: 'page_table', fulfilment: 'dine_in', tableNo: '3', paymentMethod: 'pay_at_table' })
    for (const to of ['confirmed', 'preparing', 'ready'] as const) await orders.transitionOrder(seated.id, to, asOwner)
    await assert.rejects(orders.transitionOrder(seated.id, 'out_for_delivery', asOwner), IllegalTransitionError)
    assert.equal((await orders.transitionOrder(seated.id, 'delivered', asOwner)).status, 'delivered')

    const events = (await orders.getOrder(seated.id))?.events.map((e) => e.toStatus)
    assert.deepEqual(events, ['received', 'confirmed', 'preparing', 'ready', 'delivered'])
  })

  it('needs a reason to cancel, and records it', async () => {
    const o = await placeOrder()
    await assert.rejects(orders.transitionOrder(o.id, 'cancelled', asOwner), /reason/)
    await assert.rejects(orders.transitionOrder(o.id, 'cancelled', asOwner, '   '), /reason/)
    const cancelled = await orders.transitionOrder(o.id, 'cancelled', asOwner, 'Customer did not answer')
    assert.equal(cancelled.cancelledReason, 'Customer did not answer')
    await assert.rejects(orders.transitionOrder(o.id, 'confirmed', asOwner), IllegalTransitionError)
  })

  it('markCorrected is a staff action and sets the flag', async () => {
    const o = await placeOrder()
    await assert.rejects(orders.markCorrected(o.id, SYSTEM), /staff/)
    const fixed = await orders.markCorrected(o.id, asOwner)
    assert.equal(fixed.correctionFlag, true)
    assert.equal(fixed.correctedBy, owner.id)
  })
})

describe('markPaid', () => {
  it('confirms the order once, and a second identical webhook is a no-op', async () => {
    const o = await placeOrder({ paymentMethod: 'upi_link' })
    const link = await orders.attachPayment(
      { orderId: o.id, gateway: 'mock', linkId: 'plink_1', amountPaise: o.totalPaise }, SYSTEM,
    )
    assert.equal(link.status, 'awaiting')
    const awaiting = await orders.getOrder(o.id)
    assert.equal(awaiting?.status, 'awaiting_payment')
    assert.equal(awaiting?.paymentStatus, 'awaiting')

    const first = await orders.markPaid('plink_1', 'pay_1', o.totalPaise, { event: 'payment_link.paid' })
    assert.deepEqual(first, { ok: true, orderId: o.id, alreadyPaid: false })
    const paid = await orders.getOrder(o.id)
    assert.equal(paid?.status, 'confirmed')
    assert.equal(paid?.paymentStatus, 'paid')
    assert.ok(paid?.confirmedAt)
    assert.equal(paid?.payments[0]?.paymentId, 'pay_1')
    assert.deepEqual(paid?.payments[0]?.webhookPayload, { event: 'payment_link.paid' })
    const eventsAfterFirst = paid?.events.length

    const second = await orders.markPaid('plink_1', 'pay_1', o.totalPaise, { event: 'payment.captured' })
    assert.deepEqual(second, { ok: true, orderId: o.id, alreadyPaid: true })
    const still = await orders.getOrder(o.id)
    assert.equal(still?.status, 'confirmed')
    assert.equal(still?.events.length, eventsAfterFirst, 'no second transition')
    assert.equal(still?.payments[0]?.paymentId, 'pay_1', 'the first payment id stands')

    assert.deepEqual(await orders.markPaid('plink_nope', 'pay_x', 1, {}), { ok: false, reason: 'unknown_link' })
  })

  it('refuses an amount that is not the link amount', async () => {
    const o = await placeOrder({ paymentMethod: 'upi_link' })
    await orders.attachPayment({ orderId: o.id, gateway: 'mock', linkId: 'plink_2', amountPaise: o.totalPaise }, SYSTEM)
    assert.deepEqual(
      await orders.markPaid('plink_2', 'pay_2', o.totalPaise - 1, {}),
      { ok: false, reason: 'amount_mismatch' },
    )
    assert.equal((await orders.getOrder(o.id))?.status, 'awaiting_payment')
  })

  it('a resent link keeps the order where it is', async () => {
    const o = await placeOrder({ paymentMethod: 'upi_link' })
    await orders.attachPayment({ orderId: o.id, gateway: 'mock', linkId: 'plink_3a', amountPaise: o.totalPaise }, SYSTEM)
    await orders.attachPayment({ orderId: o.id, gateway: 'mock', linkId: 'plink_3b', amountPaise: o.totalPaise }, asOwner)
    const full = await orders.getOrder(o.id)
    assert.equal(full?.status, 'awaiting_payment')
    assert.equal(full?.payments.length, 2)
    assert.equal(full?.events.length, 2, 'one transition, not two')
  })

  it('a resent link closes the one it replaces, so only the newest is payable', async () => {
    const o = await placeOrder({ paymentMethod: 'upi_link' })
    const first = await orders.attachPayment({ orderId: o.id, gateway: 'mock', linkId: 'plink_4a', amountPaise: o.totalPaise }, SYSTEM)
    const second = await orders.attachPayment({ orderId: o.id, gateway: 'mock', linkId: 'plink_4b', amountPaise: o.totalPaise }, asOwner)
    const payments = (await orders.getOrder(o.id))?.payments ?? []
    assert.equal(payments.find((p) => p.id === first.id)?.status, 'unpaid', 'the replaced link is closed')
    assert.equal(payments.find((p) => p.id === second.id)?.status, 'awaiting')
    assert.equal((await orders.getOrder(o.id))?.paymentStatus, 'awaiting')
  })

  it('a webhook for a second link on an order the first already paid is a no-op', async () => {
    const o = await placeOrder({ paymentMethod: 'upi_link' })
    await orders.attachPayment({ orderId: o.id, gateway: 'mock', linkId: 'plink_5a', amountPaise: o.totalPaise }, SYSTEM)
    await orders.attachPayment({ orderId: o.id, gateway: 'mock', linkId: 'plink_5b', amountPaise: o.totalPaise }, asOwner)
    assert.deepEqual(await orders.markPaid('plink_5b', 'pay_5b', o.totalPaise, {}), { ok: true, orderId: o.id, alreadyPaid: false })
    const paid = await orders.getOrder(o.id)
    assert.equal(paid?.status, 'confirmed')
    const paymentAudits = await auditCount('payment')

    // The stale SMS, tapped after the fact.
    assert.deepEqual(await orders.markPaid('plink_5a', 'pay_5a', o.totalPaise, {}), { ok: true, orderId: o.id, alreadyPaid: true })
    const still = await orders.getOrder(o.id)
    assert.equal(still?.events.length, paid?.events.length, 'no second transition')
    const stale = still?.payments.find((p) => p.linkId === 'plink_5a')
    assert.equal(stale?.status, 'unpaid', 'left as attachPayment closed it')
    assert.equal(stale?.paymentId, null)
    assert.equal(await auditCount('payment'), paymentAudits, 'nothing written')
  })
})

describe('listOpenOrders', () => {
  it('ranks pinned → needs attention → active oldest first, and drops terminal orders', async () => {
    const [board] = await db.insert(schema.outlet).values({
      restaurantId: restaurant.id, name: 'Board', addressLine: 'x', area: 'y', pincode: '560001',
    }).returning()
    assert.ok(board)
    const at = (outletId: string, over: Partial<Parameters<typeof orders.createOrder>[0]> = {}) =>
      placeOrder({ outletId, ...over })

    const active1 = await at(board.id)
    const attention = await at(board.id)
    await orders.transitionOrder(attention.id, 'needs_attention', asOwner)
    const active2 = await at(board.id)
    const pinned = await at(board.id)
    await orders.transitionOrder(pinned.id, 'address_pending', SYSTEM)
    const gone = await at(board.id)
    await orders.transitionOrder(gone.id, 'cancelled', asOwner, 'test')

    const open = await orders.listOpenOrders(board.id)
    assert.deepEqual(open.map((o) => o.id), [pinned.id, attention.id, active1.id, active2.id])
    assert.ok(open.every((o) => o.items.length === 2))

    const since = new Date(Date.now() - 60_000)
    const changed = await orders.listOrdersSince(board.id, since)
    assert.equal(changed.length, 5, 'the change feed includes creations and the cancellation')
    assert.equal((await orders.listOrdersSince(board.id, new Date(Date.now() + 60_000))).length, 0)
  })
})

// --- codes --------------------------------------------------------------------------------

describe('codes', () => {
  it('a batch is qty upper-case codes, found case-insensitively', async () => {
    const { batch, codes: made } = await codes.createBatch(
      { restaurantId: restaurant.id, outletId: outlet.id, qty: 25, percent: 10 }, asOwner,
    )
    assert.equal(made.length, 25)
    assert.equal(new Set(made.map((c) => c.code)).size, 25)
    assert.ok(made.every((c) => /^[A-HJ-NP-Z2-9]{8}$/.test(c.code) && c.kind === 'win_back_card' && c.batchId === batch.id))

    const first = made[0]
    assert.ok(first)
    assert.equal((await codes.getCodeByText(restaurant.id, ` ${first.code.toLowerCase()} `))?.id, first.id)
    assert.equal(await codes.getCodeByText(otherRestaurant.id, first.code), null, 'codes are per restaurant')

    const [listed] = await codes.listBatches(restaurant.id)
    assert.equal(listed?.id, batch.id)
    assert.equal(listed?.codeCount, 25)
    assert.equal(listed?.redemptionCount, 0)
  })

  it('a second redemption of the same code by the same customer is refused by the index', async () => {
    const { codes: [card] } = await codes.createBatch(
      { restaurantId: restaurant.id, outletId: outlet.id, qty: 1, percent: 10 }, asOwner,
    )
    assert.ok(card)
    const o1 = await placeOrder({ discountCodeId: card.id })
    const o2 = await placeOrder({ discountCodeId: card.id })

    assert.equal(await codes.countPriorRedemptions(card, anita.id), 0)
    const first = await codes.recordRedemption(
      { code: card, customerId: anita.id, orderId: o1.id, channel: 'page_delivery' }, asCustomer(anita.id),
    )
    assert.ok(first.ok)
    // Straight to the insert: no pre-check stands between this call and the unique index.
    const second = await codes.recordRedemption(
      { code: card, customerId: anita.id, orderId: o2.id, channel: 'page_delivery' }, asCustomer(anita.id),
    )
    assert.deepEqual(second, { ok: false, reason: 'already_redeemed' })
    assert.equal(await codes.countPriorRedemptions(card, anita.id), 1)

    const [n] = await db.select({ n: count() }).from(schema.codeRedemption).where(eq(schema.codeRedemption.codeId, card.id))
    assert.equal(n?.n, 1)
    assert.equal((await auditCount('code_redemption')), 1, 'the refused attempt leaves no audit row either')
  })

  it('a second win-back card at the same restaurant is also refused (the partial index)', async () => {
    const { batch, codes: [secondCard] } = await codes.createBatch(
      { restaurantId: restaurant.id, outletId: outlet.id, qty: 1, percent: 15 }, asOwner,
    )
    assert.ok(secondCard)
    // The per-restaurant count already sees the first card's redemption, across batches.
    assert.equal(await codes.countPriorRedemptions(secondCard, anita.id), 1)

    const o = await placeOrder({ discountCodeId: secondCard.id })
    const result = await codes.recordRedemption(
      { code: secondCard, customerId: anita.id, orderId: o.id, channel: 'page_delivery' }, asCustomer(anita.id),
    )
    assert.deepEqual(result, { ok: false, reason: 'already_redeemed' })
    assert.deepEqual(await codes.listRedemptionsForBatch(batch.id), [])

    // A different customer is not affected by Anita's card.
    const bo = await placeOrder({ customerId: bala.id, discountCodeId: secondCard.id })
    const forBala = await codes.recordRedemption(
      { code: secondCard, customerId: bala.id, orderId: bo.id, channel: 'page_delivery' }, asCustomer(bala.id),
    )
    assert.ok(forBala.ok)
    const redemptions = await codes.listRedemptionsForBatch(batch.id)
    assert.deepEqual(redemptions.map((r) => [r.code, r.customerId, r.orderId]), [[secondCard.code, bala.id, bo.id]])
    assert.equal((await codes.listBatches(restaurant.id)).find((b) => b.id === batch.id)?.redemptionCount, 1)
  })

  it('a manual code is not blocked by a prior win-back, but is once per code', async () => {
    const [manual] = await db.insert(schema.discountCode)
      .values({ restaurantId: restaurant.id, code: 'WELCOME10', kind: 'manual', percent: 10 }).returning()
    assert.ok(manual)
    assert.equal(await codes.countPriorRedemptions(manual, anita.id), 0, 'manual counts per code, not per restaurant')

    const o1 = await placeOrder({ discountCodeId: manual.id })
    const ok = await codes.recordRedemption(
      { code: manual, customerId: anita.id, orderId: o1.id, channel: 'page_delivery' }, asCustomer(anita.id),
    )
    assert.ok(ok.ok)
    assert.equal(await codes.countPriorRedemptions(manual, anita.id), 1)

    const o2 = await placeOrder({ discountCodeId: manual.id })
    const twice = await codes.recordRedemption(
      { code: manual, customerId: anita.id, orderId: o2.id, channel: 'page_delivery' }, asCustomer(anita.id),
    )
    assert.deepEqual(twice, { ok: false, reason: 'already_redeemed' })

    // Non-unique failures still throw: a redemption against an order that does not exist.
    await assert.rejects(codes.recordRedemption(
      { code: manual, customerId: bala.id, orderId: '00000000-0000-4000-8000-000000000000', channel: 'page_delivery' },
      asCustomer(bala.id),
    ))
  })

  it('refuses a batch outside 1..5000 cards or a percent outside 1..100', async () => {
    await assert.rejects(codes.createBatch({ restaurantId: restaurant.id, outletId: outlet.id, qty: 0, percent: 10 }, asOwner), RangeError)
    await assert.rejects(codes.createBatch({ restaurantId: restaurant.id, outletId: outlet.id, qty: 1, percent: 0 }, asOwner), RangeError)
  })
})

describe('audit', () => {
  it('every customer-data write left a row, none carrying a phone number', async () => {
    for (const entity of ['customer', 'consent_record', 'customer_address', 'customer_restaurant', 'order', 'payment', 'code_redemption']) {
      assert.ok((await auditCount(entity)) > 0, `${entity} audited`)
    }
    const leaked = await db.select({ n: count() }).from(schema.auditLog)
      .where(sql`${schema.auditLog.after}::text like '%+9198765%'`)
    assert.equal(leaked[0]?.n, 0)
  })
})
