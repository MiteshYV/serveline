import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { SESSION_TTL_SECONDS, signSession, verifySession, type Audience, type Session } from './jwt.ts'

export type { Audience, Session }

/**
 * Build Spec §3 Auth: JWT in httpOnly cookies. One cookie per audience so a customer ordering on
 * their own phone, a staff member on the counter phone and an agent on a laptop never share or
 * overwrite a session, and so a staff cookie can never be read as a platform one.
 *
 * `createSession` and `clearSession` write cookies, which Next allows only from a server action or
 * a route handler — not from a server component. `getSession` reads and is safe anywhere.
 */
const COOKIE: Record<Audience, string> = {
  customer: 'sl_customer',
  staff: 'sl_staff',
  platform: 'sl_platform',
}

export async function createSession(s: Session): Promise<void> {
  const jar = await cookies()
  jar.set(COOKIE[s.audience], await signSession(s), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_TTL_SECONDS[s.audience],
  })
}

export async function getSession(audience: Audience): Promise<Session | null> {
  const token = (await cookies()).get(COOKIE[audience])?.value
  return token ? verifySession(token, audience) : null
}

export async function clearSession(audience: Audience): Promise<void> {
  ;(await cookies()).delete(COOKIE[audience])
}

/** Dashboard gate (Build Spec §7). Anything short of a staff session with a restaurant goes to login. */
export async function requireStaff(): Promise<Session & { restaurantId: string; role: 'owner' | 'staff' }> {
  const s = await getSession('staff')
  if (!s || !s.restaurantId || (s.role !== 'owner' && s.role !== 'staff')) redirect('/app/login')
  return { ...s, restaurantId: s.restaurantId, role: s.role }
}

/** Agent console gate (Build Spec §8). */
export async function requirePlatform(): Promise<Session & { role: 'agent' | 'admin' }> {
  const s = await getSession('platform')
  if (!s || (s.role !== 'agent' && s.role !== 'admin')) redirect('/agent/login')
  return { ...s, role: s.role }
}
