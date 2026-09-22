/**
 * Finding session-role-never-rechecked-against-the-row. Against a real PGlite, like the repo
 * tests: the point of the fix is that authorisation reads a row, so a test with no row proves
 * nothing. `src/auth/session.ts` itself cannot be imported here — it pulls in `next/headers`,
 * which only Next's bundler resolves — so the lookups it delegates to are tested directly.
 */

import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { eq } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { hashPhone } from '../core/phone.ts'

// A fresh database per run; client.ts reads DATABASE_URL when first imported, so everything that
// touches `db` is imported dynamically below this line.
process.env.DATABASE_URL = `file://${mkdtempSync(join(tmpdir(), 'serveline-identity-'))}`

const { db, schema } = await import('../db/client.ts')
const { platformIdentity, staffIdentity } = await import('./identity.ts')

await migrate(db, { migrationsFolder: fileURLToPath(new URL('../db/migrations', import.meta.url)) })
after(() => db.$client.close())

const PEPPER = 'test-pepper'

const [restaurant] = await db.insert(schema.restaurant)
  .values({ name: 'Udupi Grand', slug: 'udupi-grand-identity' }).returning()
assert.ok(restaurant)

const ownerPhone = '+919876543210'
const [owner] = await db.insert(schema.staffUser).values({
  restaurantId: restaurant.id, phone: ownerPhone, phoneHash: hashPhone(ownerPhone, PEPPER),
  name: 'Owner', role: 'owner',
}).returning()
assert.ok(owner)

const adminPhone = '+919812345678'
const [admin] = await db.insert(schema.platformUser).values({
  phone: adminPhone, phoneHash: hashPhone(adminPhone, PEPPER), name: 'Admin', role: 'admin',
}).returning()
assert.ok(admin)

describe('staffIdentity', () => {
  it('reports the role the row holds now, not the one the cookie was minted with', async () => {
    assert.deepEqual(await staffIdentity(owner.id), {
      id: owner.id, restaurantId: restaurant.id, role: 'owner',
    })

    // The owner demotes them. A seven-day cookie still says `role: 'owner'`; the row does not,
    // and the row is what the dashboard must believe.
    await db.update(schema.staffUser).set({ role: 'staff' }).where(eq(schema.staffUser.id, owner.id))
    assert.equal((await staffIdentity(owner.id))?.role, 'staff')
  })

  it('is null once the row is gone, so a live cookie stops opening the dashboard', async () => {
    const phone = '+919800000001'
    const [leaver] = await db.insert(schema.staffUser).values({
      restaurantId: restaurant.id, phone, phoneHash: hashPhone(phone, PEPPER), name: 'Leaver', role: 'staff',
    }).returning()
    assert.ok(leaver)
    assert.ok(await staffIdentity(leaver.id))

    await db.delete(schema.staffUser).where(eq(schema.staffUser.id, leaver.id))
    assert.equal(await staffIdentity(leaver.id), null)
  })

  it('is null for a subject id that was never staff, whatever the claim said', async () => {
    // An id from the other table: the audience check stops the cookie, this stops the claim.
    assert.equal(await staffIdentity(admin.id), null)
  })
})

describe('platformIdentity', () => {
  it('follows a demotion from admin to agent', async () => {
    assert.deepEqual(await platformIdentity(admin.id), { id: admin.id, role: 'admin' })
    await db.update(schema.platformUser).set({ role: 'agent' }).where(eq(schema.platformUser.id, admin.id))
    assert.equal((await platformIdentity(admin.id))?.role, 'agent')
  })

  it('is null once the row is gone — the admin-only audit log included', async () => {
    const phone = '+919800000002'
    const [agent] = await db.insert(schema.platformUser).values({
      phone, phoneHash: hashPhone(phone, PEPPER), name: 'Agent', role: 'agent',
    }).returning()
    assert.ok(agent)
    assert.ok(await platformIdentity(agent.id))

    await db.delete(schema.platformUser).where(eq(schema.platformUser.id, agent.id))
    assert.equal(await platformIdentity(agent.id), null)
  })

  it('is null for a staff id, so a staff subject can never be read as a console user', async () => {
    assert.equal(await platformIdentity(owner.id), null)
  })
})
