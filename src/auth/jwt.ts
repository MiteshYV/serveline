import { SignJWT, jwtVerify } from 'jose'
import { sessionSecret } from './secrets.ts'

/**
 * Session tokens, independent of Next so they can be tested under plain `node --test`.
 * `session.ts` is the cookie layer over these two functions.
 */

export type Audience = 'customer' | 'staff' | 'platform'

export type Session = {
  audience: Audience
  subjectId: string
  restaurantId?: string
  role?: string
}

/** Build Spec §3 Auth: "customer sessions 30 days, staff 7 days". Platform users follow staff. */
export const SESSION_TTL_SECONDS: Record<Audience, number> = {
  customer: 30 * 86_400,
  staff: 7 * 86_400,
  platform: 7 * 86_400,
}

const key = () => new TextEncoder().encode(sessionSecret())

export async function signSession(s: Session): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  return new SignJWT({ rid: s.restaurantId, role: s.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(s.subjectId)
    .setAudience(s.audience)
    .setIssuedAt(now)
    .setExpirationTime(now + SESSION_TTL_SECONDS[s.audience])
    .sign(key())
}

/**
 * Returns null for anything that is not a live token for this audience: bad signature, expired,
 * or a token minted for another audience. The audience check is what stops a staff cookie being
 * replayed as a platform one even if the cookie names were confused.
 */
export async function verifySession(token: string, audience: Audience): Promise<Session | null> {
  try {
    const { payload } = await jwtVerify(token, key(), { audience, algorithms: ['HS256'] })
    if (typeof payload.sub !== 'string') return null
    const s: Session = { audience, subjectId: payload.sub }
    if (typeof payload.rid === 'string') s.restaurantId = payload.rid
    if (typeof payload.role === 'string') s.role = payload.role
    return s
  } catch {
    return null
  }
}

/**
 * The address-link token (Build Spec §6: `/r/{slug}/address/{token}` opens the form for one
 * `address_pending` order). Same key and algorithm as a session, but its own audience, so it can
 * never be replayed as a session cookie and a session can never open an address form. Seven days:
 * a customer who has not confirmed in a week has been called by then (Ideation §8).
 */
const ADDRESS_TTL_SECONDS = 7 * 86_400

export async function signAddressToken(orderId: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(orderId)
    .setAudience('address')
    .setIssuedAt(now)
    .setExpirationTime(now + ADDRESS_TTL_SECONDS)
    .sign(key())
}

/** The order id the token was minted for, or null for anything that is not a live address token. */
export async function verifyAddressToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, key(), { audience: 'address', algorithms: ['HS256'] })
    return typeof payload.sub === 'string' ? payload.sub : null
  } catch {
    return null
  }
}
