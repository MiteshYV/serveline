/**
 * What the agent console reads and writes (Build Spec §8), at the M1 subset the design names —
 * "the agent console exists at M1 only as far as M1 needs it; its real content is M4". The
 * restaurant list and overview, creating a restaurant, the two admin edits, and the audit log.
 * Orders, menus and win-back keep their own files; this one composes across them.
 *
 * ponytail: Build Spec §10 says "agent sees assigned restaurants; admin sees all". There is no
 * assignment table at M1, so every platform user sees every restaurant. The upgrade is an
 * `agent_restaurant` join and a `where` here.
 */

import { and, asc, count, desc, eq, getTableColumns, inArray, isNull, sql } from 'drizzle-orm'
import type { OnboardingFacts } from '../../core/onboarding.ts'
import { db } from '../client.ts'
import {
  auditLog, consentRecord, customerRestaurant, externalOrderCount, language, menu, order, outlet,
  restaurant, staffUser,
} from '../schema/index.ts'
import { type Actor, firstRow, writeAudit } from './ops.ts'

type RestaurantRow = typeof restaurant.$inferSelect
type OutletRow = typeof outlet.$inferSelect
type Language = (typeof language.enumValues)[number]

/** A raw sub-select comes back as whatever the driver sends; a timestamp is made a Date here. */
const asDate = (v: unknown): Date | null => (v == null ? null : new Date(v as string | number | Date))

/**
 * The onboarding facts and the list columns, as sub-selects on the restaurant row. Table names
 * are written out rather than `${column}` for the reason given on `listBatches` in codes.ts.
 */
const facts = {
  outletCount: sql<number>`(select count(*)::int from outlet o where o.restaurant_id = restaurant.id)`,
  outletCreatedAt: sql`(select min(o.created_at) from outlet o where o.restaurant_id = restaurant.id)`.mapWith(asDate),
  ownerVerifiedAt: sql`(select max(su.last_login_at) from staff_user su where su.restaurant_id = restaurant.id and su.role = 'owner')`.mapWith(asDate),
  menuPublishedAt: sql`(select max(m.published_at) from menu m join outlet o on o.id = m.outlet_id where o.restaurant_id = restaurant.id)`.mapWith(asDate),
  settingsConfigured: sql<boolean>`exists(select 1 from outlet o where o.restaurant_id = restaurant.id and o.hours <> '{}'::jsonb and o.handoff_number is not null)`,
  batchPlacedAt: sql`(select min(cb.placed_at) from card_batch cb where cb.restaurant_id = restaurant.id)`.mapWith(asDate),
  placementAuditedAt: sql`(select min(cb.placement_audited_at) from card_batch cb where cb.restaurant_id = restaurant.id and cb.placed_at is not null)`.mapWith(asDate),
  firstOrderAt: sql`(select min(o.placed_at) from "order" o where o.restaurant_id = restaurant.id)`.mapWith(asDate),
  lastOrderAt: sql`(select max(o.placed_at) from "order" o where o.restaurant_id = restaurant.id)`.mapWith(asDate),
  needsAttentionCount: sql<number>`(select count(*)::int from "order" o where o.restaurant_id = restaurant.id and o.status = 'needs_attention')`,
}

const overviewSelect = { ...getTableColumns(restaurant), ...facts }

export type RestaurantOverview = RestaurantRow & { [K in keyof typeof facts]: (typeof facts)[K]['_']['type'] }

/** Build Spec §8 "Restaurants: list with onboarding stage". One query, however many restaurants. */
export function listRestaurantOverviews(): Promise<RestaurantOverview[]> {
  return db.select(overviewSelect).from(restaurant).orderBy(asc(restaurant.name))
}

export async function getRestaurantOverview(restaurantId: string): Promise<RestaurantOverview | null> {
  const [row] = await db.select(overviewSelect).from(restaurant).where(eq(restaurant.id, restaurantId))
  return row ?? null
}

/** The slice of an overview row that core's stage and checklist read. */
export const overviewFacts = (r: RestaurantOverview): OnboardingFacts => ({
  outletCreatedAt: r.outletCreatedAt,
  ownerVerifiedAt: r.ownerVerifiedAt,
  menuPublishedAt: r.menuPublishedAt,
  settingsConfigured: r.settingsConfigured,
  batchPlacedAt: r.batchPlacedAt,
  placementAuditedAt: r.placementAuditedAt,
  firstOrderAt: r.firstOrderAt,
})

/**
 * Everything the restaurant page shows in one call: outlets, staff (never the phone — the page
 * has the outlet's numbers, which is the row that legitimately holds them), menus with item
 * counts, the last twenty orders, the aggregator counts, and the two consent figures.
 * Batches come from codes.ts, which the page calls itself.
 */
export async function getRestaurantDetail(restaurantId: string) {
  const overview = await getRestaurantOverview(restaurantId)
  if (!overview) return null

  const outlets = await db.query.outlet.findMany({
    where: eq(outlet.restaurantId, restaurantId),
    orderBy: asc(outlet.createdAt),
  })
  const outletIds = outlets.map((o) => o.id)

  const staff = await db.query.staffUser.findMany({
    where: eq(staffUser.restaurantId, restaurantId),
    orderBy: asc(staffUser.createdAt),
    columns: { phone: false },
  })

  const menus = outletIds.length === 0 ? [] : await db
    .select({
      ...getTableColumns(menu),
      itemCount: sql<number>`(select count(*)::int from menu_item mi where mi.menu_id = menu.id)`,
    })
    .from(menu)
    .where(inArray(menu.outletId, outletIds))
    .orderBy(desc(menu.version))

  const recentOrders = await db.query.order.findMany({
    where: eq(order.restaurantId, restaurantId),
    orderBy: desc(order.placedAt),
    limit: 20,
    with: { items: { columns: { qty: true, nameSnapshot: true } } },
  })

  const externalCounts = outletIds.length === 0 ? [] : await db
    .select({ ...getTableColumns(externalOrderCount), outletName: outlet.name })
    .from(externalOrderCount)
    .innerJoin(outlet, eq(outlet.id, externalOrderCount.outletId))
    .where(inArray(externalOrderCount.outletId, outletIds))
    .orderBy(desc(externalOrderCount.weekStart))

  const [consents] = await db.select({ n: count() }).from(consentRecord)
    .where(and(eq(consentRecord.restaurantId, restaurantId), isNull(consentRecord.withdrawnAt)))
  const [customers] = await db.select({ n: count() }).from(customerRestaurant)
    .where(eq(customerRestaurant.restaurantId, restaurantId))

  return {
    ...overview,
    outlets,
    staff,
    menus,
    recentOrders,
    externalCounts,
    activeConsents: consents?.n ?? 0,
    knownCustomers: customers?.n ?? 0,
  }
}

export type CreateRestaurantInput = {
  name: string
  slug: string
  /** Raw hex as typed; the UI normalises it (design §3.5) and never renders it raw. */
  brandColour: string
  trialCallLimit: number
  outlet: {
    name: string
    addressLine: string
    area: string
    pincode: string
    displayPhone: string | null
    codEnabled: boolean
    languages: Language[]
  }
  owner: { name: string; phone: string; phoneHash: string }
}

/** `outlet` may hold phone numbers; `audit_log` may not (CLAUDE.md). Same redaction as restaurants.ts. */
const outletAudit = (o: OutletRow) => ({
  ...o,
  displayPhone: o.displayPhone ? '[phone]' : null,
  virtualNumber: o.virtualNumber ? '[phone]' : null,
  ownerMobile: o.ownerMobile ? '[phone]' : null,
  handoffNumber: o.handoffNumber ? '[phone]' : null,
})

/**
 * Build Spec §11 step 1: "Restaurant and outlet created". One transaction: the restaurant, its
 * first outlet, and the owner as a `staff_user` who can then log in to the dashboard. The
 * owner's mobile doubles as the outlet's owner mobile and handoff number (Build Spec §5.1 —
 * the carrier's failover target) until settings say otherwise.
 *
 * The trial clock starts here, as the seed does it. Ideation §10 fixes the trial's length, not
 * its start; if it should start at go-live instead, this is the one line to move.
 */
export async function createRestaurant(input: CreateRestaurantInput, actor: Actor) {
  return db.transaction(async (tx) => {
    const r = firstRow(
      await tx.insert(restaurant).values({
        name: input.name,
        slug: input.slug,
        brandColour: input.brandColour,
        trialCallLimit: input.trialCallLimit,
        status: 'trialing',
        trialStartedAt: new Date(),
      }).returning(),
      'restaurant',
    )
    const o = firstRow(
      await tx.insert(outlet).values({
        restaurantId: r.id,
        name: input.outlet.name,
        addressLine: input.outlet.addressLine,
        area: input.outlet.area,
        pincode: input.outlet.pincode,
        displayPhone: input.outlet.displayPhone,
        codEnabled: input.outlet.codEnabled,
        languages: input.outlet.languages,
        ownerMobile: input.owner.phone,
        handoffNumber: input.owner.phone,
      }).returning(),
      'outlet',
    )
    const owner = firstRow(
      await tx.insert(staffUser).values({
        restaurantId: r.id,
        phone: input.owner.phone,
        phoneHash: input.owner.phoneHash,
        name: input.owner.name,
        role: 'owner',
      }).returning(),
      'staff_user',
    )

    const base = { actorType: actor.type, actorId: actor.id, before: null }
    await writeAudit({ ...base, action: 'restaurant.create', entity: 'restaurant', entityId: r.id, after: r }, tx)
    await writeAudit({ ...base, action: 'outlet.create', entity: 'outlet', entityId: o.id, after: outletAudit(o) }, tx)
    const { phone: _phone, ...ownerAudit } = owner
    await writeAudit({ ...base, action: 'staff_user.create', entity: 'staff_user', entityId: owner.id, after: ownerAudit }, tx)

    return { restaurant: r, outlet: o, owner }
  })
}

/** Build Spec §8 "Admin only: suspend and reactivate restaurants, edit plan limits". */
export type RestaurantAdminPatch = Partial<Pick<RestaurantRow, 'status' | 'trialCallLimit'>>

const adminView = (r: RestaurantRow) => ({ status: r.status, trialCallLimit: r.trialCallLimit })

/** Authorisation (admin only) is the route's job; this records who did it either way. */
export async function updateRestaurantAdmin(restaurantId: string, patch: RestaurantAdminPatch, actor: Actor) {
  return db.transaction(async (tx) => {
    const before = await tx.query.restaurant.findFirst({ where: eq(restaurant.id, restaurantId) })
    if (!before) throw new Error(`No restaurant ${restaurantId}`)
    const after = firstRow(
      await tx.update(restaurant).set(patch).where(eq(restaurant.id, restaurantId)).returning(),
      `restaurant ${restaurantId}`,
    )
    await writeAudit({
      actorType: actor.type,
      actorId: actor.id,
      action: 'restaurant.admin',
      entity: 'restaurant',
      entityId: restaurantId,
      before: adminView(before),
      after: adminView(after),
    }, tx)
    return after
  })
}

export const AUDIT_PAGE_SIZE = 100

/** Build Spec §8 "Admin only: view the audit log". Newest first; `hasMore` costs one extra row. */
export async function listAuditLog(opts: { entity?: string; page: number }) {
  const page = Math.max(1, Math.trunc(opts.page))
  const rows = await db
    .select()
    .from(auditLog)
    .where(opts.entity ? eq(auditLog.entity, opts.entity) : undefined)
    .orderBy(desc(auditLog.at), desc(auditLog.id))
    .limit(AUDIT_PAGE_SIZE + 1)
    .offset((page - 1) * AUDIT_PAGE_SIZE)
  return { rows: rows.slice(0, AUDIT_PAGE_SIZE), hasMore: rows.length > AUDIT_PAGE_SIZE, page }
}

/** The entity filter's choices: whatever has actually been audited. */
export async function listAuditEntities(): Promise<string[]> {
  const rows = await db.selectDistinct({ entity: auditLog.entity }).from(auditLog).orderBy(asc(auditLog.entity))
  return rows.map((r) => r.entity)
}
