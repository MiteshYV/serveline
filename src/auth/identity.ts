import { eq } from 'drizzle-orm'
import { db } from '../db/client.ts'
import { platformUser, staffUser } from '../db/schema/index.ts'

/**
 * Who the bearer of a session cookie *is now*, read from the row rather than taken from the JWT.
 *
 * Finding session-role-never-rechecked-against-the-row: `requireStaff`/`requirePlatform` used to
 * decide authorisation entirely from the `role` and `sub` claims, so a cookie kept working for its
 * full seven days after the staff or platform row was deleted or demoted, from every device it was
 * already on, with no way to cut the session short. A token is a claim about the past; the row is
 * the present, and authorisation must read the present.
 *
 * The cost is one indexed primary-key lookup per request per audience — `session.ts` wraps these in
 * React `cache`, because a layout does not re-render on a client navigation and `requirePlatform`
 * alone has 25 call sites. That is the price of revocation ever working at all.
 *
 * Kept out of `session.ts` so it can be exercised under plain `node --test`: `session.ts` imports
 * `next/headers`, which only Next's bundler resolves. `jwt.ts` stays DB-free for the same reason.
 *
 * ponytail: these two belong in `src/db/repos/staff.ts` beside the phone-hash lookups, and should
 * move there (plus the `repos/index.ts` barrel) when that file is next open.
 */

export type StaffIdentity = { id: string; restaurantId: string; role: 'owner' | 'staff' }
export type PlatformIdentity = { id: string; role: 'agent' | 'admin' }

/** Null when there is no such staff row, or it no longer holds a role the dashboard recognises. */
export async function staffIdentity(id: string): Promise<StaffIdentity | null> {
  const row = await db.query.staffUser.findFirst({ where: eq(staffUser.id, id) })
  if (!row) return null
  // Checked rather than cast: a role added to the enum later must be let in deliberately, not by
  // inheriting whatever the dashboard happens to allow today.
  if (row.role !== 'owner' && row.role !== 'staff') return null
  return { id: row.id, restaurantId: row.restaurantId, role: row.role }
}

/** Null when there is no such platform row, or it no longer holds a console role. */
export async function platformIdentity(id: string): Promise<PlatformIdentity | null> {
  const row = await db.query.platformUser.findFirst({ where: eq(platformUser.id, id) })
  if (!row) return null
  if (row.role !== 'agent' && row.role !== 'admin') return null
  return { id: row.id, role: row.role }
}
