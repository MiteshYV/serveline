/**
 * Finding duplicate-saved-addresses, against a real PGlite like the other repo tests: the fix is
 * a SQL match on the normalised line, so a test that does not run the statement proves nothing.
 *
 * The rest of the customers repo is covered by commerce.test.ts; this file is the address
 * de-duplication alone.
 */

import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { and, eq } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { NOTICE_VERSION } from '../../core/consent.ts'
import { hashPhone } from '../../core/phone.ts'

// A fresh database per run; client.ts reads DATABASE_URL when first imported, so everything that
// touches `db` is imported dynamically below this line.
process.env.DATABASE_URL = `file://${mkdtempSync(join(tmpdir(), 'serveline-customers-'))}`

const { db, schema } = await import('../client.ts')
const customers = await import('./customers.ts')

await migrate(db, { migrationsFolder: fileURLToPath(new URL('../migrations', import.meta.url)) })
after(() => db.$client.close())

const PEPPER = 'test-pepper'

const [restaurant] = await db.insert(schema.restaurant)
  .values({ name: 'Udupi Grand', slug: 'udupi-grand-addresses' }).returning()
assert.ok(restaurant)
const [otherRestaurant] = await db.insert(schema.restaurant)
  .values({ name: 'Nagarjuna', slug: 'nagarjuna-addresses' }).returning()
assert.ok(otherRestaurant)

const phone = '+919876543210'
const anita = await customers.upsertCustomer(
  { phone, phoneHash: hashPhone(phone, PEPPER) },
  { type: 'system', id: null },
)
const asAnita = { type: 'customer' as const, id: anita.id }

for (const r of [restaurant, otherRestaurant]) {
  await customers.recordConsent({
    customerId: anita.id, restaurantId: r.id, noticeVersion: NOTICE_VERSION,
    purposes: ['order_fulfilment', 'order_history'], channel: 'page', language: 'en', evidence: {},
  }, asAnita)
}

const save = (over: Partial<Parameters<typeof customers.saveAddress>[0]>) =>
  customers.saveAddress(
    { customerId: anita.id, restaurantId: restaurant.id, line1: '12 MG Road', source: 'page', ...over },
    asAnita,
  )

const addressCount = async (restaurantId = restaurant.id) =>
  (await db.select().from(schema.customerAddress).where(and(
    eq(schema.customerAddress.customerId, anita.id),
    eq(schema.customerAddress.restaurantId, restaurantId),
  ))).length

describe('saveAddress de-duplication', () => {
  it('a double-tapped form leaves one row, not two', async () => {
    const first = await save({ pincode: '560038' })
    const second = await save({ pincode: '560038' })
    assert.equal(second.id, first.id, 'the same door is the same row')
    assert.equal(await addressCount(), 1)
    assert.equal((await customers.listAddresses(anita.id, restaurant.id)).length, 1)
  })

  it('case and stray whitespace alone are not a new address', async () => {
    const first = await save({ pincode: '560038' })
    const retyped = await save({ line1: '  12  mg  road ', pincode: '560038' })
    assert.equal(retyped.id, first.id)
    assert.equal(await addressCount(), 1)
  })

  it('keeps what an earlier save knew and fills in what this one adds', async () => {
    await save({ pincode: '560038', label: 'Home', landmark: 'Opp. temple', isConfirmed: true })
    const again = await save({ pincode: '560038', area: 'Indiranagar' })
    assert.equal(again.label, 'Home', 'a label is not dropped by a save that omits it')
    assert.equal(again.landmark, 'Opp. temple')
    assert.equal(again.area, 'Indiranagar', 'a newly supplied field lands')
    assert.equal(again.isConfirmed, true, 'confirmation rises and never falls')
  })

  it('does not bump lastUsedAt: that marker means ordered-to, not retyped', async () => {
    const row = await save({ pincode: '560038' })
    await db.update(schema.customerAddress)
      .set({ lastUsedAt: new Date('2026-09-01T12:00:00Z') })
      .where(eq(schema.customerAddress.id, row.id))
    const again = await save({ pincode: '560038' })
    assert.equal(again.lastUsedAt?.toISOString(), '2026-09-01T12:00:00.000Z')
  })

  it('still audits, as an update, and still without the door in it', async () => {
    const row = await save({ pincode: '560038' })
    await save({ pincode: '560038', label: 'Home' })
    const entries = await db.select().from(schema.auditLog)
      .where(eq(schema.auditLog.entityId, row.id))
    const actions = entries.map((e) => e.action)
    assert.ok(actions.includes('address.create'))
    assert.ok(actions.includes('address.update'), 'a re-save is audited too, as an update')
    assert.ok(
      !JSON.stringify(entries).includes('MG Road'),
      'no full address in audit_log, on the update path either',
    )
  })

  it('a genuinely different door, pincode or restaurant is still its own row', async () => {
    await save({ pincode: '560038' })
    const before = await addressCount()

    await save({ line1: 'Tower B', pincode: '560038' })
    // Same line, different pincode: two flats can share a street name across localities.
    await save({ pincode: '560008' })
    // No pincode at all (a voice address) is not the same row as one that has one.
    await save({})
    assert.equal(await addressCount(), before + 3)

    // Consent at one restaurant does not reach another, and neither does an address.
    await customers.saveAddress(
      { customerId: anita.id, restaurantId: otherRestaurant.id, line1: '12 MG Road', pincode: '560038', source: 'page' },
      asAnita,
    )
    assert.equal(await addressCount(otherRestaurant.id), 1)
  })

  it('two pincode-less saves of the same line are one row', async () => {
    const first = await customers.saveAddress(
      { customerId: anita.id, restaurantId: otherRestaurant.id, line1: 'Near the temple', source: 'voice_rough' },
      asAnita,
    )
    const second = await customers.saveAddress(
      { customerId: anita.id, restaurantId: otherRestaurant.id, line1: 'near the temple', source: 'voice_rough' },
      asAnita,
    )
    assert.equal(second.id, first.id)
  })
})
