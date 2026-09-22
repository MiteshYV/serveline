/**
 * Finding negative-unit-price-cart, at the repository. Against a real PGlite, as catalog.test.ts
 * does: `upsertItem` must refuse a menu row that can price a line below zero, whichever parser
 * posted it. Before this guard the bug-hunt repro (`pricePaise` 10000 with a variant delta of
 * −15000) published happily and produced a confirmed order with a total of −5000.
 *
 * A separate file from catalog.test.ts so this owns its own database and fixture.
 */

import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { CartError, priceCart } from '../../core/cart.ts'
import { paise } from '../../core/money.ts'
import { hashPhone } from '../../core/phone.ts'

// client.ts reads DATABASE_URL when first imported, and a static import would be hoisted above
// this line — hence the dynamic imports of everything that touches `db`.
process.env.DATABASE_URL = `file://${mkdtempSync(join(tmpdir(), 'serveline-menu-floor-'))}`

const { db, schema } = await import('../client.ts')
const menuRepo = await import('./menu.ts')

await migrate(db, { migrationsFolder: fileURLToPath(new URL('../migrations', import.meta.url)) })
after(() => db.$client.close())

const PEPPER = 'test-pepper'
const ownerPhone = '+919876543211'

const [restaurant] = await db.insert(schema.restaurant)
  .values({ name: 'Anand Bhavan', slug: 'anand-bhavan' }).returning()
assert.ok(restaurant)

const [outlet] = await db.insert(schema.outlet).values({
  restaurantId: restaurant.id, name: 'Jayanagar', addressLine: '4th Block', area: 'Jayanagar',
  pincode: '560011', serviceablePincodes: ['560011'],
}).returning()
assert.ok(outlet)

const [owner] = await db.insert(schema.staffUser).values({
  restaurantId: restaurant.id, phone: ownerPhone, phoneHash: hashPhone(ownerPhone, PEPPER),
  name: 'Owner', role: 'owner',
}).returning()
assert.ok(owner)
const asOwner = { type: 'staff' as const, id: owner.id }

const [menuRow] = await db.insert(schema.menu)
  .values({ outletId: outlet.id, version: 1, publishedAt: new Date(), publishedBy: owner.id }).returning()
assert.ok(menuRow)

const [mains] = await db.insert(schema.menuCategory)
  .values({ menuId: menuRow.id, name: 'Mains', sort: 1 }).returning()
assert.ok(mains)

describe('upsertItem price floor', () => {
  it('refuses a variant delta larger than the base price', async () => {
    // The bug hunt's repro verbatim: ₹100 with a "Half −₹150".
    await assert.rejects(
      menuRepo.upsertItem({
        categoryId: mains.id,
        name: 'Promo Biryani',
        pricePaise: 10000,
        variants: [{ name: 'Half', priceDeltaPaise: -15000 }],
      }, asOwner),
      /below zero|can price at/,
    )
  })

  it('refuses option deltas that together take the price below zero', async () => {
    // Each delta on its own is affordable; two of them, within the group maximum, are not.
    await assert.rejects(
      menuRepo.upsertItem({
        categoryId: mains.id,
        name: 'Light Combo',
        pricePaise: 4000,
        optionGroups: [{
          name: 'Leave out',
          minSelect: 0,
          maxSelect: 2,
          options: [
            { name: 'No rice', priceDeltaPaise: -2500 },
            { name: 'No curd', priceDeltaPaise: -2500 },
          ],
        }],
      }, asOwner),
      /below zero|can price at/,
    )
  })

  it('refuses a base price dropped under a variant the edit does not mention', async () => {
    // The trigger the bug hunt describes: an owner lowers the base price for a promotion and the
    // old negative variant, left out of the form, is kept by the repository's own diff.
    const saved = await menuRepo.upsertItem({
      categoryId: mains.id,
      name: 'Chicken Biryani',
      pricePaise: 24000,
      variants: [{ name: 'Half', priceDeltaPaise: -8000 }],
    }, asOwner)

    await assert.rejects(
      menuRepo.upsertItem({
        id: saved.id, categoryId: mains.id, name: 'Chicken Biryani', pricePaise: 5000,
      }, asOwner),
      /below zero|can price at/,
    )

    const unchanged = await menuRepo.upsertItem({
      id: saved.id, categoryId: mains.id, name: 'Chicken Biryani', pricePaise: 24000,
    }, asOwner)
    assert.equal(unchanged.pricePaise, 24000, 'the refused edit rolled back and the row still prices')
  })

  it('allows a negative delta that leaves the line at or above zero', async () => {
    const saved = await menuRepo.upsertItem({
      categoryId: mains.id,
      name: 'Veg Thali',
      pricePaise: 18000,
      variants: [{ name: 'Half', priceDeltaPaise: -9000 }],
    }, asOwner)

    const half = saved.variants.find((v) => v.name === 'Half')
    const published = await menuRepo.getPublishedMenu(outlet.id)
    assert.ok(half && published)
    const cart = priceCart(
      [{ itemId: saved.id, variantId: half.id, optionIds: [], qty: 1 }],
      menuRepo.toPricedMenu(published),
    )
    assert.equal(cart.totalPaise, 9000)
  })

  it('keeps core and the repository agreeing on what a valid row is', () => {
    // The repository refuses the row; core refuses the line. Neither alone is the guarantee.
    assert.throws(
      () => priceCart(
        [{ itemId: 'itm_x', variantId: 'var_x', optionIds: [], qty: 1 }],
        [{
          id: 'itm_x',
          name: 'Impossible',
          pricePaise: paise(10000),
          variants: [{ id: 'var_x', name: 'Half', priceDeltaPaise: paise(-15000) }],
          optionGroups: [],
        }],
      ),
      (thrown: unknown) => thrown instanceof CartError && thrown.code === 'invalid_price',
    )
  })
})
