/**
 * The agent console's repo against a real PGlite: the overview sub-selects (quoting "order",
 * mapping timestamps), the one-transaction restaurant create with redacted audit rows, the admin
 * patch, audit paging, and the editor functions added to menu.ts.
 */

import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { eq } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { deriveChecklist, onboardingStage } from '../../core/onboarding.ts'
import { hashPhone } from '../../core/phone.ts'

process.env.DATABASE_URL = `file://${mkdtempSync(join(tmpdir(), 'serveline-platform-'))}`

const { db, schema } = await import('../client.ts')
const platform = await import('./platform.ts')
const menuRepo = await import('./menu.ts')

await migrate(db, { migrationsFolder: fileURLToPath(new URL('../migrations', import.meta.url)) })
after(() => db.$client.close())

const admin: { type: 'platform'; id: string } = { type: 'platform', id: '11111111-1111-4111-8111-111111111111' }
const ownerPhone = '+919900000001'

describe('createRestaurant', () => {
  it('writes restaurant, outlet and owner together and audits each without the phone', async () => {
    const { restaurant, outlet, owner } = await platform.createRestaurant({
      name: 'Udupi Grand',
      slug: 'udupi-grand',
      brandColour: '#1F6F5C',
      trialCallLimit: 150,
      outlet: { name: 'Jayanagar', addressLine: '12, 4th Block', area: 'Jayanagar', pincode: '560011', displayPhone: null, codEnabled: true, languages: ['kn', 'en'] },
      owner: { name: 'Shanthi', phone: ownerPhone, phoneHash: hashPhone(ownerPhone, 'pepper') },
    }, admin)
    assert.equal(outlet.restaurantId, restaurant.id)
    assert.equal(outlet.ownerMobile, ownerPhone)
    assert.equal(owner.role, 'owner')
    assert.equal(restaurant.status, 'trialing')

    const audits = await db.select().from(schema.auditLog).orderBy(schema.auditLog.at)
    assert.deepEqual(audits.map((a) => a.action), ['restaurant.create', 'outlet.create', 'staff_user.create'])
    for (const a of audits) assert.ok(!JSON.stringify(a.after).includes(ownerPhone), `phone leaked in ${a.action}`)
    assert.equal((audits[1]?.after as { ownerMobile: unknown }).ownerMobile, '[phone]')
  })

  it('a duplicate slug rolls the whole thing back', async () => {
    await assert.rejects(platform.createRestaurant({
      name: 'Dup', slug: 'udupi-grand', brandColour: '#000000', trialCallLimit: 1,
      outlet: { name: 'x', addressLine: 'x', area: 'x', pincode: '560001', displayPhone: null, codEnabled: false, languages: ['en'] },
      owner: { name: 'x', phone: '+919900000002', phoneHash: hashPhone('+919900000002', 'pepper') },
    }, admin))
    const owners = await db.select().from(schema.staffUser)
    assert.equal(owners.length, 1)
  })
})

describe('overview', () => {
  it('derives the stage from what exists and advances it as rows land', async () => {
    const [r] = await platform.listRestaurantOverviews()
    assert.ok(r)
    assert.equal(r.outletCount, 1)
    assert.ok(r.outletCreatedAt instanceof Date)
    assert.equal(r.menuPublishedAt, null)
    assert.equal(r.firstOrderAt, null)
    assert.equal(r.settingsConfigured, false) // hours are {} and handoff is set: both are needed
    assert.equal(r.needsAttentionCount, 0)
    assert.equal(onboardingStage(platform.overviewFacts(r)), 'menu')
    assert.equal(deriveChecklist(platform.overviewFacts(r))[0]?.state, 'todo')

    const [outlet] = await db.select().from(schema.outlet)
    assert.ok(outlet)
    const menu = await menuRepo.ensureMenu(outlet.id, admin)
    assert.equal(menu.publishedAt, null)
    assert.equal((await menuRepo.ensureMenu(outlet.id, admin)).id, menu.id) // idempotent
    assert.equal(await menuRepo.getPublishedMenu(outlet.id), null)
    assert.equal((await menuRepo.getMenuForEditing(outlet.id))?.menu.id, menu.id)

    await menuRepo.publishMenu(outlet.id, admin)
    const after = await platform.getRestaurantOverview(r.id)
    assert.ok(after?.menuPublishedAt instanceof Date)
    assert.equal(onboardingStage(platform.overviewFacts(after)), 'cards')
  })

  it('getRestaurantDetail composes the page without the staff phone', async () => {
    const [r] = await platform.listRestaurantOverviews()
    assert.ok(r)
    const detail = await platform.getRestaurantDetail(r.id)
    assert.ok(detail)
    assert.equal(detail.outlets.length, 1)
    assert.equal(detail.menus[0]?.itemCount, 0)
    assert.equal('phone' in (detail.staff[0] ?? {}), false)
    assert.equal(detail.activeConsents, 0)
    assert.equal(await platform.getRestaurantDetail('00000000-0000-4000-8000-000000000000'), null)
  })
})

describe('menu editor', () => {
  it('categories and items round-trip through upsert and delete, each audited', async () => {
    const [outlet] = await db.select().from(schema.outlet)
    assert.ok(outlet)
    const menu = await menuRepo.ensureMenu(outlet.id, admin)
    const cat = await menuRepo.upsertCategory({ menuId: menu.id, name: 'Tiffin', sort: 1 }, admin)
    const renamed = await menuRepo.upsertCategory({ id: cat.id, menuId: menu.id, name: 'South Indian Tiffin' }, admin)
    assert.equal(renamed.sort, 1)
    await assert.rejects(menuRepo.upsertCategory({ menuId: menu.id, name: '   ' }, admin), /name/)

    const item = await menuRepo.upsertItem({ categoryId: cat.id, name: 'Idli Vada', pricePaise: 7000 }, admin)
    const tree = await menuRepo.getMenuForEditing(outlet.id)
    assert.equal(tree?.categories[0]?.items[0]?.id, item.id)

    await menuRepo.deleteItem(item.id, admin)
    await menuRepo.deleteCategory(cat.id, admin)
    assert.equal((await menuRepo.getMenuForEditing(outlet.id))?.categories.length, 0)

    const actions = (await db.select().from(schema.auditLog).where(eq(schema.auditLog.actorId, admin.id))).map((a) => a.action)
    for (const a of ['menu.create', 'menu_category.create', 'menu_category.update', 'menu_item.create', 'menu_item.delete', 'menu_category.delete']) {
      assert.ok(actions.includes(a), `missing audit ${a}`)
    }
  })
})

describe('admin and audit', () => {
  it('updateRestaurantAdmin patches and audits only the two admin fields', async () => {
    const [r] = await platform.listRestaurantOverviews()
    assert.ok(r)
    const after = await platform.updateRestaurantAdmin(r.id, { status: 'suspended', trialCallLimit: 300 }, admin)
    assert.equal(after.status, 'suspended')
    assert.equal(after.trialCallLimit, 300)
    const [row] = await db.select().from(schema.auditLog).where(eq(schema.auditLog.action, 'restaurant.admin'))
    assert.deepEqual(row?.before, { status: 'trialing', trialCallLimit: 150 })
    assert.deepEqual(row?.after, { status: 'suspended', trialCallLimit: 300 })
  })

  it('listAuditLog pages newest first and filters by entity', async () => {
    const page = await platform.listAuditLog({ page: 1 })
    assert.ok(page.rows.length > 5)
    assert.equal(page.hasMore, false)
    for (let i = 1; i < page.rows.length; i++) {
      assert.ok((page.rows[i - 1]?.at.getTime() ?? 0) >= (page.rows[i]?.at.getTime() ?? 0))
    }
    const menus = await platform.listAuditLog({ entity: 'menu', page: 1 })
    assert.ok(menus.rows.every((r) => r.entity === 'menu'))
    assert.ok((await platform.listAuditEntities()).includes('staff_user'))
    assert.equal((await platform.listAuditLog({ page: 99 })).rows.length, 0)
  })
})
