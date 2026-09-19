import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { count, eq, sql } from 'drizzle-orm'
import type { PgTable } from 'drizzle-orm/pg-core'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { applyPercentDiscount, paise } from '../core/money.ts'
import * as schema from './schema/index.ts'
import { seed } from './seed.ts'

// In-memory PGlite: the real dialect, no files, gone when the process ends. ./data is untouched.
const client = new PGlite()
const db = drizzle(client, { schema })

before(() => migrate(db, { migrationsFolder: fileURLToPath(new URL('./migrations', import.meta.url)) }))
after(() => client.close())

describe('seed', () => {
  it('loads the demo restaurant once and is a no-op the second time', async () => {
    assert.equal(await seed(db), 'seeded')
    assert.equal(await seed(db), 'already_seeded')

    const n = async (table: PgTable) => (await db.select({ n: count() }).from(table))[0]?.n

    assert.equal(await n(schema.restaurant), 1)
    assert.equal(await n(schema.menuItem), 24)
    assert.equal(await n(schema.order), 7)
    assert.equal(await n(schema.discountCode), 2)
    assert.equal(await n(schema.externalOrderCount), 2)
    assert.equal(await n(schema.codeRedemption), 1)
    // customer ×5, consent ×3, address ×3, customer_restaurant ×3
    assert.equal(await n(schema.auditLog), 14)
  })

  it('prices every order with core: items sum to the subtotal and the win-back code is 10% off', async () => {
    const orders = await db.select().from(schema.order)
    for (const o of orders) {
      const [sum] = await db
        .select({ v: sql<number>`coalesce(sum(${schema.orderItem.unitPricePaise} * ${schema.orderItem.qty}), 0)::int` })
        .from(schema.orderItem)
        .where(eq(schema.orderItem.orderId, o.id))
      assert.equal(sum?.v, o.subtotalPaise, `order ${o.id} subtotal`)
      assert.equal(o.subtotalPaise - o.discountPaise, o.totalPaise, `order ${o.id} total`)
    }

    const discounted = orders.filter((o) => o.discountCodeId !== null)
    assert.equal(discounted.length, 1)
    const [w] = discounted
    assert.equal(w?.totalPaise, applyPercentDiscount(paise(w?.subtotalPaise ?? 0), 10))
  })

  it('never puts a phone number in the audit trail', async () => {
    const rows = await db.select({ after: schema.auditLog.after }).from(schema.auditLog)
    for (const { after } of rows) assert.doesNotMatch(JSON.stringify(after), /\+91\d{10}/)
  })
})
