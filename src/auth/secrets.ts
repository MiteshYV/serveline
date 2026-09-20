import { createHash } from 'node:crypto'

/**
 * The two server secrets auth needs: the session-signing key and the phone-hash pepper.
 *
 * CLAUDE.md: a missing variable is an error, not a silent fallback. The one exception is
 * `NODE_ENV=development` — what `next dev` sets and nothing else does — where the app must run
 * with none of `.env.example` filled in, so an unset variable derives a fixed value from a
 * constant and says so once on the console. The derived value is deterministic on purpose:
 * sessions and phone hashes survive a dev restart. It is also computable by anyone with the
 * repo, which is why no other NODE_ENV gets it: `next start` on a staging box with
 * `NODE_ENV=staging`, or a bare `node` process, throws with the variable's name rather than let
 * an admin cookie or an OTP challenge be minted from a public constant.
 */

const warned = new Set<string>()

function read(name: 'SESSION_SECRET' | 'PHONE_HASH_PEPPER'): string {
  const value = process.env[name]
  if (value) return value
  if (process.env.NODE_ENV !== 'development') {
    throw new Error(`${name} must be set outside \`next dev\` (generate one with: openssl rand -hex 32)`)
  }
  if (!warned.has(name)) {
    warned.add(name)
    console.warn(`[auth] ${name} is not set; using a fixed development value. Never deploy like this.`)
  }
  return createHash('sha256').update(`serveline-dev-only:${name}`).digest('hex')
}

/** HS256 key for session JWTs and the HMAC key for OTP challenges. */
export const sessionSecret = (): string => read('SESSION_SECRET')

/**
 * The pepper for `hashPhone` (src/core/phone.ts). Every `phone_hash` in the estate is computed
 * with this one value, so read it from here and nowhere else.
 */
export const phonePepper = (): string => read('PHONE_HASH_PEPPER')
