/**
 * Build Spec §4 gives an order a uuid and no sequence, so the number a kitchen shouts is its rank
 * among the outlet's orders that IST day. That rank must not depend on the database session's
 * timezone — the bug it had (docs/reviews/2026-09-22-bug-hunt.md, order-number-day-boundary-tz).
 */

import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { sql } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/pglite/migrator'

process.env.DATABASE_URL = `file://${mkdtempSync(join(tmpdir(), 'serveline-dashboard-'))}`
process.env.VENDOR_MODE = 'mock'

const { db, schema } = await import('../client.ts')
const { orderNumbers } = await import('./dashboard.ts')

await migrate(db, { migrationsFolder: fileURLToPath(new URL('../migrations', import.meta.url)) })
after(() => db.$client.close())

const one = <T>(rows: T[]): T => {
  const row = rows[0]
  assert.ok(row)
  return row
}

const restaurant = one(await db.insert(schema.restaurant).values({ name: 'Clock Test', slug: 'clock-test' }).returning())
const outlet = one(await db.insert(schema.outlet).values({
  restaurantId: restaurant.id, name: 'Only', addressLine: '1 Road', area: 'Koramangala', pincode: '560095',
}).returning())

// Five orders around 18:30 UTC — 00:00 IST. The first four are one IST day, the fifth is the next.
const at = async (iso: string) =>
  one(await db.insert(schema.order).values({
    restaurantId: restaurant.id, outletId: outlet.id, channel: 'page_delivery', fulfilment: 'delivery',
    subtotalPaise: 10000, totalPaise: 10000, paymentMethod: 'cod', placedAt: new Date(iso),
  }).returning())

const placed = [
  { at: await at('2026-09-22T06:30:00Z'), ist: '22nd 12:00', expect: 1 },
  { at: await at('2026-09-22T13:00:00Z'), ist: '22nd 18:30', expect: 2 },
  { at: await at('2026-09-22T14:00:00Z'), ist: '22nd 19:30', expect: 3 },
  { at: await at('2026-09-22T16:30:00Z'), ist: '22nd 22:00', expect: 4 },
  { at: await at('2026-09-22T19:00:00Z'), ist: '23rd 00:30', expect: 1 },
]

test('order numbers cut the day at IST midnight, whatever the database session thinks the time is', async () => {
  // Pinned explicitly, and twice: on a UTC machine the old expression happened to be right, so a
  // test that only ran in the host's timezone would pass on CI and fail on a laptop in Bangalore.
  for (const tz of ['UTC', 'America/New_York', 'Asia/Kolkata']) {
    await db.execute(sql.raw(`set time zone '${tz}'`))
    const numbers = await orderNumbers(outlet.id, placed.map((p) => ({ id: p.at.id, placedAt: p.at.placedAt })))
    for (const p of placed) {
      assert.equal(numbers.get(p.at.id), p.expect, `${p.ist} under session timezone ${tz}`)
    }
  }
})
