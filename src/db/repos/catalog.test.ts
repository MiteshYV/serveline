/**
 * Integration test for the catalogue repos against a real PGlite, not a mock (M1 design,
 * "Testing"). Covers: the published menu nests correctly, `toPricedMenu` feeds core's
 * `priceCart`, and every write leaves an audit row — with no phone number in it.
 */

import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { count, eq } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { CartError, priceCart } from '../../core/cart.ts'
import { hashPhone } from '../../core/phone.ts'

// A fresh database per run. client.ts reads DATABASE_URL when first imported, and a static
// import would be hoisted above this line — hence the dynamic imports of everything that
// touches `db`.
process.env.DATABASE_URL = `file://${mkdtempSync(join(tmpdir(), 'serveline-catalog-'))}`

const { db, schema } = await import('../client.ts')
const menuRepo = await import('./menu.ts')
const restaurants = await import('./restaurants.ts')
const staff = await import('./staff.ts')
const ops = await import('./ops.ts')

await migrate(db, { migrationsFolder: fileURLToPath(new URL('../migrations', import.meta.url)) })
after(() => db.$client.close())

// --- fixture: one restaurant, two outlets, one owner, one published menu ------------------

const PEPPER = 'test-pepper'
const ownerPhone = '+919876543210'

const [restaurant] = await db.insert(schema.restaurant)
  .values({ name: 'Udupi Grand', slug: 'udupi-grand' }).returning()
assert.ok(restaurant)

const [outlet] = await db.insert(schema.outlet).values({
  restaurantId: restaurant.id, name: 'Indiranagar', addressLine: '100 Feet Road', area: 'Indiranagar',
  pincode: '560038', serviceablePincodes: ['560038', '560008'],
}).returning()
assert.ok(outlet)

// A second outlet whose menu has never been published: the ordering page must not show it.
const [draftOutlet] = await db.insert(schema.outlet).values({
  restaurantId: restaurant.id, name: 'Koramangala', addressLine: '80 Feet Road', area: 'Koramangala',
  pincode: '560034',
}).returning()
assert.ok(draftOutlet)

const [owner] = await db.insert(schema.staffUser).values({
  restaurantId: restaurant.id, phone: ownerPhone, phoneHash: hashPhone(ownerPhone, PEPPER),
  name: 'Owner', role: 'owner',
}).returning()
assert.ok(owner)
const asOwner = { type: 'staff' as const, id: owner.id }

const [menu] = await db.insert(schema.menu)
  .values({ outletId: outlet.id, version: 1, publishedAt: new Date(), publishedBy: owner.id }).returning()
assert.ok(menu)
await db.insert(schema.menu).values({ outletId: draftOutlet.id, version: 1 })

// Sort deliberately disagrees with insertion order, so the test sees ordering, not luck.
const [starters] = await db.insert(schema.menuCategory)
  .values({ menuId: menu.id, name: 'Starters', sort: 2 }).returning()
const [mains] = await db.insert(schema.menuCategory)
  .values({ menuId: menu.id, name: 'Mains', sort: 1 }).returning()
assert.ok(starters && mains)

const dosa = await menuRepo.upsertItem({
  categoryId: starters.id, name: 'Masala Dosa', pricePaise: 12000, isVeg: true,
}, asOwner)

const biryani = await menuRepo.upsertItem({
  categoryId: mains.id,
  name: 'Chicken Biryani',
  pricePaise: 24000,
  spiceLevel: 'medium',
  variants: [
    { name: 'Full', priceDeltaPaise: 0 },
    { name: 'Half', priceDeltaPaise: -8000 },
  ],
  optionGroups: [
    { name: 'Add raita', options: [{ name: 'Boondi raita', priceDeltaPaise: 4000 }] },
  ],
}, asOwner)

const auditRows = (entity: string) =>
  db.select().from(schema.auditLog).where(eq(schema.auditLog.entity, entity))

describe('getPublishedMenu', () => {
  it('nests categories → items → variants and option groups → options, each in order', async () => {
    const published = await menuRepo.getPublishedMenu(outlet.id)
    assert.ok(published)
    assert.equal(published.menu.id, menu.id)
    assert.equal(published.menu.version, 1)

    assert.deepEqual(published.categories.map((c) => c.name), ['Mains', 'Starters'])

    const [mainsCat, startersCat] = published.categories
    assert.deepEqual(mainsCat?.items.map((i) => i.name), ['Chicken Biryani'])
    assert.deepEqual(startersCat?.items.map((i) => i.name), ['Masala Dosa'])

    const item = mainsCat?.items[0]
    assert.ok(item)
    assert.equal(item.menuId, menu.id, 'menu_id is derived from the category')
    assert.deepEqual(item.variants.map((v) => [v.name, v.priceDeltaPaise]), [['Half', -8000], ['Full', 0]])
    assert.equal(item.optionGroups.length, 1)
    assert.equal(item.optionGroups[0]?.name, 'Add raita')
    assert.deepEqual(item.optionGroups[0]?.options.map((o) => o.name), ['Boondi raita'])

    // The flat list is the same objects as the tree.
    assert.equal(published.items.length, 2)
    assert.ok(published.items.includes(item))
  })

  it('returns null for an outlet whose menu was never published', async () => {
    assert.equal(await menuRepo.getPublishedMenu(draftOutlet.id), null)
  })
})

describe('toPricedMenu', () => {
  it('feeds core priceCart: variant delta and option delta land in the total', async () => {
    const published = await menuRepo.getPublishedMenu(outlet.id)
    assert.ok(published)
    const priced = menuRepo.toPricedMenu(published)
    const half = biryani.variants.find((v) => v.name === 'Half')
    const raita = biryani.optionGroups[0]?.options[0]
    assert.ok(half && raita)

    const cart = priceCart([
      { itemId: biryani.id, variantId: half.id, optionIds: [raita.id], qty: 2 },
      { itemId: dosa.id, optionIds: [], qty: 1 },
    ], priced)

    // (24000 − 8000 + 4000) × 2 + 12000
    assert.equal(cart.subtotalPaise, 52000)
    assert.equal(cart.totalPaise, 52000)
    assert.deepEqual(cart.lines.map((l) => l.variantName), ['Half', null])
  })

  it('drops a sold-out item so pricing refuses it, while the page still lists it', async () => {
    await menuRepo.setItemAvailability(dosa.id, false, asOwner)
    const published = await menuRepo.getPublishedMenu(outlet.id)
    assert.ok(published)

    const listed = published.items.find((i) => i.id === dosa.id)
    assert.equal(listed?.isAvailable, false)
    assert.ok(!menuRepo.toPricedMenu(published).some((i) => i.id === dosa.id))
    assert.throws(
      () => priceCart([{ itemId: dosa.id, optionIds: [], qty: 1 }], menuRepo.toPricedMenu(published)),
      (e: unknown) => e instanceof CartError && e.code === 'unknown_item',
    )

    const audit = (await auditRows('menu_item')).filter((r) => r.action === 'menu_item.availability')
    assert.equal(audit.length, 1)
    assert.deepEqual(audit[0]?.after, { isAvailable: false })
    assert.equal(audit[0]?.actorId, owner.id)

    await menuRepo.setItemAvailability(dosa.id, true, asOwner)
  })
})

describe('upsertItem', () => {
  it('on an edit, diffs children by id: keeps, updates, adds, deletes', async () => {
    const full = biryani.variants.find((v) => v.name === 'Full')
    const group = biryani.optionGroups[0]
    const raita = group?.options[0]
    assert.ok(full && group && raita)

    const edited = await menuRepo.upsertItem({
      id: biryani.id,
      categoryId: mains.id,
      name: 'Chicken Biryani',
      pricePaise: 26000,
      variants: [{ id: full.id, name: 'Full plate', priceDeltaPaise: 0 }], // Half is dropped
      optionGroups: [{
        id: group.id, name: 'Add raita', maxSelect: 2,
        options: [
          { id: raita.id, name: 'Boondi raita', priceDeltaPaise: 4000 },
          { name: 'Extra gravy', priceDeltaPaise: 2000 },
        ],
      }],
    }, asOwner)

    assert.equal(edited.pricePaise, 26000)
    assert.equal(edited.spiceLevel, 'medium', 'a scalar left out keeps its stored value')
    assert.deepEqual(edited.variants.map((v) => [v.id, v.name]), [[full.id, 'Full plate']])
    assert.equal(edited.optionGroups[0]?.id, group.id)
    assert.equal(edited.optionGroups[0]?.maxSelect, 2)
    assert.deepEqual(edited.optionGroups[0]?.options.map((o) => o.name), ['Extra gravy', 'Boondi raita'])

    const updates = (await auditRows('menu_item')).filter((r) => r.action === 'menu_item.update')
    assert.equal(updates.length, 1)
    assert.equal((updates[0]?.before as { pricePaise: number }).pricePaise, 24000)
  })

  it('leaves children alone when they are not mentioned', async () => {
    const again = await menuRepo.upsertItem({
      id: biryani.id, categoryId: mains.id, name: 'Chicken Biryani', pricePaise: 26000,
    }, asOwner)
    assert.equal(again.variants.length, 1)
    assert.equal(again.optionGroups[0]?.options.length, 2)
  })

  it('refuses a rupee float and an unsatisfiable option group', async () => {
    await assert.rejects(
      menuRepo.upsertItem({ categoryId: mains.id, name: 'Bad', pricePaise: 120.5 }, asOwner),
      TypeError,
    )
    await assert.rejects(
      menuRepo.upsertItem({
        categoryId: mains.id, name: 'Bad', pricePaise: 100,
        optionGroups: [{ name: 'Impossible', minSelect: 2, maxSelect: 1, options: [] }],
      }, asOwner),
      /min_select 2 exceeds max_select 1/,
    )
  })
})

describe('publishMenu', () => {
  it('bumps the version in place and records who published', async () => {
    const published = await menuRepo.publishMenu(outlet.id, asOwner)
    assert.equal(published.version, 2)
    assert.equal(published.publishedBy, owner.id)
    assert.equal((await menuRepo.getPublishedMenu(outlet.id))?.menu.version, 2)

    const byAgent = await menuRepo.publishMenu(outlet.id, { type: 'platform', id: owner.id })
    assert.equal(byAgent.version, 3)
    assert.equal(byAgent.publishedBy, null, 'published_by is a staff_user or nothing')

    assert.equal((await auditRows('menu')).length, 2)
  })
})

describe('restaurants', () => {
  it('finds a restaurant by slug with its outlets, oldest first', async () => {
    const found = await restaurants.getRestaurantBySlug('udupi-grand')
    assert.equal(found?.id, restaurant.id)
    assert.deepEqual(found?.outlets.map((o) => o.id), [outlet.id, draftOutlet.id])
    assert.equal(await restaurants.getRestaurantBySlug('nope'), null)
    assert.equal((await restaurants.getRestaurant(restaurant.id))?.slug, 'udupi-grand')
    assert.equal((await restaurants.getOutlet(outlet.id))?.restaurant.name, 'Udupi Grand')
    assert.deepEqual((await restaurants.listRestaurants()).map((r) => r.slug), ['udupi-grand'])
  })

  it('updates only the §7 settings fields and keeps phone numbers out of the audit log', async () => {
    const updated = await restaurants.updateOutletSettings(outlet.id, {
      codEnabled: false,
      ownerMobile: ownerPhone,
      serviceablePincodes: ['560038'],
      // Not a setting; must be ignored, not written.
      ...({ name: 'Renamed' } as object),
    }, asOwner)
    assert.equal(updated.codEnabled, false)
    assert.equal(updated.ownerMobile, ownerPhone)
    assert.equal(updated.name, 'Indiranagar')

    const [audit] = await auditRows('outlet')
    assert.ok(audit)
    assert.equal((audit.after as { ownerMobile: unknown }).ownerMobile, '[phone]')
    assert.equal((audit.before as { ownerMobile: unknown }).ownerMobile, null)
    assert.ok(!JSON.stringify(audit).includes('9876543210'))
  })
})

describe('staff', () => {
  it('looks up by phone hash, scoped or not, and touches last login', async () => {
    const hash = hashPhone(ownerPhone, PEPPER)
    assert.equal((await staff.findStaffByPhoneHash(undefined, hash))?.id, owner.id)
    assert.equal((await staff.findStaffByPhoneHash(restaurant.id, hash))?.id, owner.id)
    assert.equal(await staff.findStaffByPhoneHash(draftOutlet.id, hash), null)
    assert.equal(await staff.findPlatformUserByPhoneHash(hash), null)

    await staff.touchLastLogin(owner.id)
    const touched = await db.query.staffUser.findFirst({ where: eq(schema.staffUser.id, owner.id) })
    assert.ok(touched?.lastLoginAt instanceof Date)
  })
})

describe('ops', () => {
  it('upserts one external count per outlet per week and audits it', async () => {
    const monday = '2026-09-14'
    await ops.upsertExternalCount({ outletId: outlet.id, weekStart: monday, swiggyOrders: 40, zomatoOrders: 25 }, asOwner)
    const corrected = await ops.upsertExternalCount(
      { outletId: outlet.id, weekStart: monday, swiggyOrders: 42, zomatoOrders: 25, otherOrders: 3 }, asOwner,
    )
    assert.equal(corrected.swiggyOrders, 42)
    assert.equal(corrected.otherOrders, 3)

    const [{ n } = { n: 0 }] = await db.select({ n: count() }).from(schema.externalOrderCount)
    assert.equal(n, 1)
    assert.equal((await ops.getExternalCount(outlet.id, monday))?.id, corrected.id)
    assert.equal(await ops.getExternalCount(outlet.id, '2026-09-07'), null)

    assert.deepEqual(
      (await auditRows('external_order_count')).map((r) => r.action),
      ['external_order_count.create', 'external_order_count.update'],
    )
    await assert.rejects(
      ops.upsertExternalCount({ outletId: outlet.id, weekStart: '2026-09-15', swiggyOrders: 1, zomatoOrders: 1 }, asOwner),
      /must be a Monday/,
    )
  })

  it('logs an SMS by hash and refuses a phone number', async () => {
    const row = await ops.logSms({
      restaurantId: restaurant.id, toPhoneHash: hashPhone(ownerPhone, PEPPER), kind: 'otp',
      provider: 'mock', providerMessageId: 'mock-1', status: 'sent', costPaise: 15, sentAt: new Date(),
    })
    assert.equal(row.costPaise, 15)
    await assert.rejects(
      ops.logSms({ restaurantId: restaurant.id, toPhoneHash: ownerPhone, kind: 'otp', provider: 'mock' }),
      /not a phone number/,
    )
  })
})
