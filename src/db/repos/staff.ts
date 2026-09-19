/**
 * Login lookups for the two staff tables. Both hold a phone number, but the auth layer looks up
 * by `phone_hash` (Build Spec §4: joins use the hash), so the number never appears in a query.
 */

import { and, asc, eq } from 'drizzle-orm'
import { db } from '../client.ts'
import { platformUser, staffUser } from '../schema/index.ts'

/**
 * `restaurantId` scopes the lookup when the caller knows it. The `/app/login` page does not
 * (Build Spec §7: phone OTP login), and passes `undefined`.
 *
 * ponytail: one phone can be staff at two restaurants (the unique index is per restaurant), and
 * an unscoped lookup returns the earliest-created row. The upgrade is a restaurant chooser on the
 * login page when a hash matches more than one row.
 */
export async function findStaffByPhoneHash(restaurantId: string | undefined, hash: string) {
  const row = await db.query.staffUser.findFirst({
    where: restaurantId
      ? and(eq(staffUser.phoneHash, hash), eq(staffUser.restaurantId, restaurantId))
      : eq(staffUser.phoneHash, hash),
    orderBy: [asc(staffUser.createdAt)],
  })
  return row ?? null
}

export async function findPlatformUserByPhoneHash(hash: string) {
  const row = await db.query.platformUser.findFirst({ where: eq(platformUser.phoneHash, hash) })
  return row ?? null
}

/** `staff_user` only: `platform_user` has no `last_login_at` column (Build Spec §4). */
export async function touchLastLogin(staffUserId: string): Promise<void> {
  await db.update(staffUser).set({ lastLoginAt: new Date() }).where(eq(staffUser.id, staffUserId))
}
