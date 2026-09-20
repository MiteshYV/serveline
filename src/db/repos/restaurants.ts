/**
 * Tenancy reads and the one tenancy write M1 has: outlet settings (Build Spec §7 "Settings").
 */

import { asc, eq, type SQL } from 'drizzle-orm'
import { db } from '../client.ts'
import { outlet, restaurant } from '../schema/index.ts'
import { type Actor, firstRow, guarded, writeAudit } from './ops.ts'

type OutletRow = typeof outlet.$inferSelect

/**
 * A restaurant with its outlets, oldest first. `/r/{slug}` (Build Spec §6) has no outlet in the
 * URL, and the dashboard session carries a restaurant id, not an outlet id — so both surfaces
 * need the outlets to hand and get them in the one read.
 */
async function findRestaurant(where: SQL) {
  const row = await db.query.restaurant.findFirst({
    where,
    with: { outlets: { orderBy: [asc(outlet.createdAt)] } },
  })
  return row ?? null
}

export const getRestaurantBySlug = (slug: string) => findRestaurant(eq(restaurant.slug, slug))

/** Not in the shared contract; added because `requireStaff()` yields a restaurant id and nothing else resolves it. */
export const getRestaurant = (restaurantId: string) => findRestaurant(eq(restaurant.id, restaurantId))

export async function getOutlet(outletId: string) {
  const row = await db.query.outlet.findFirst({
    where: eq(outlet.id, outletId),
    with: { restaurant: true },
  })
  return row ?? null
}

/** Build Spec §8: the agent console's restaurant list. M1 needs only the rows. */
export function listRestaurants() {
  return db.query.restaurant.findMany({ orderBy: [asc(restaurant.name)] })
}

/** Exactly the fields Build Spec §7 "Settings" lets the dashboard change, and nothing else on the row. */
const SETTINGS_KEYS = [
  'hours', 'holidayDates', 'deliveryRadiusKm', 'serviceablePincodes', 'codEnabled',
  'ownerMobile', 'handoffNumber', 'greetingOverride', 'languages',
] as const

type SettingsKey = (typeof SETTINGS_KEYS)[number]

export type OutletSettingsPatch = Partial<Pick<typeof outlet.$inferInsert, SettingsKey>>

/**
 * `outlet` is one of the four tables allowed to hold a phone number; `audit_log` is not
 * (CLAUDE.md). The audit records that these two changed, never what they changed to.
 */
const PHONE_KEYS: ReadonlySet<SettingsKey> = new Set(['ownerMobile', 'handoffNumber'])

function settingsView(row: OutletRow): Record<SettingsKey, unknown> {
  const view = {} as Record<SettingsKey, unknown>
  for (const key of SETTINGS_KEYS) {
    view[key] = PHONE_KEYS.has(key) ? (row[key] ? '[phone]' : null) : row[key]
  }
  return view
}

/**
 * Authorisation (Build Spec §10: `staff` cannot change settings) is the route's job, before the
 * patch reaches here. Keys outside the §7 list are dropped, not written. Under `guarded`
 * (ops.ts), because two of the keys are phone numbers.
 */
export async function updateOutletSettings(outletId: string, patch: OutletSettingsPatch, actor: Actor) {
  const set: OutletSettingsPatch = {}
  for (const key of SETTINGS_KEYS) {
    if (patch[key] !== undefined) Object.assign(set, { [key]: patch[key] })
  }

  return guarded('outlet.settings', () => db.transaction(async (tx) => {
    const before = await tx.query.outlet.findFirst({ where: eq(outlet.id, outletId) })
    if (!before) throw new Error(`No outlet ${outletId}`)
    if (Object.keys(set).length === 0) return before

    const after = firstRow(
      await tx.update(outlet).set(set).where(eq(outlet.id, outletId)).returning(),
      `outlet ${outletId}`,
    )
    await writeAudit({
      actorType: actor.type,
      actorId: actor.id,
      action: 'outlet.settings',
      entity: 'outlet',
      entityId: outletId,
      before: settingsView(before),
      after: settingsView(after),
    }, tx)
    return after
  }))
}
