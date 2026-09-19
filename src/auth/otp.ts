import { createHmac, randomInt, timingSafeEqual } from 'node:crypto'
import { vendorMode } from '../adapters/mode.ts'
import { sms, type SmsLanguage } from '../adapters/sms/index.ts'
import { hashPhone } from '../core/phone.ts'
import { createLimiter } from './rate-limit.ts'
import { phonePepper, sessionSecret } from './secrets.ts'

/**
 * Stateless OTP. There is no OTP table: the server hands the client a signed `challenge` that
 * carries the phone hash and the expiry, and the client hands it back with the code.
 *
 *   challenge = base64url(JSON{ p: phoneHash, e: expiryMs }) + '.' + base64url(HMAC(payload + '.' + code))
 *
 * The code is not in the challenge. The tag can only be recomputed by someone holding both the
 * server secret and the code, so a client can keep the challenge (hidden field, cookie) without
 * learning the code, and a tampered payload or a wrong code both fail the same comparison.
 */

/** Build Spec §10: "OTPs 10 minutes". */
const OTP_TTL_MS = 10 * 60 * 1000

/** Build Spec §10: "OTP endpoints rate-limited per phone and per IP". Five per ten minutes. */
const limiter = createLimiter(5, 10 * 60 * 1000)

export class RateLimitedError extends Error {
  constructor() {
    super('Too many attempts; try again in a few minutes')
    this.name = 'RateLimitedError'
  }
}

const mac = (data: string): Buffer => createHmac('sha256', sessionSecret()).update(data).digest()

export function mintChallenge(phoneHash: string, code: string, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ p: phoneHash, e: now + OTP_TTL_MS })).toString('base64url')
  return `${payload}.${mac(`${payload}.${code}`).toString('base64url')}`
}

/**
 * Sends a six-digit code by SMS and returns the challenge to verify it against. Throws
 * `RateLimitedError` on the sixth request in ten minutes for the phone, or for `ip` when given.
 * `devCode` is returned only under `VENDOR_MODE=mock`, so a demo can log in without a handset.
 * The code is never logged.
 *
 * `origin` is the page's host (`headers().get('host')`): the SMS template ends `@origin #code`
 * so Android's WebOTP fills the field (design §7.6). `restaurant` is the name in the message;
 * staff and platform logins leave it as ServeLine.
 */
export async function issueOtp(
  phoneE164: string,
  ctx: { origin: string; restaurant?: string; language?: SmsLanguage; ip?: string },
): Promise<{ challenge: string; devCode?: string }> {
  const phoneHash = hashPhone(phoneE164, phonePepper())
  if (!limiter.hit(`issue:phone:${phoneHash}`)) throw new RateLimitedError()
  if (ctx.ip !== undefined && !limiter.hit(`issue:ip:${ctx.ip}`)) throw new RateLimitedError()

  const code = randomInt(0, 1_000_000).toString().padStart(6, '0')
  const challenge = mintChallenge(phoneHash, code)
  await sms().send({
    toPhone: phoneE164,
    kind: 'otp',
    language: ctx.language ?? 'en',
    vars: { code, restaurant: ctx.restaurant ?? 'ServeLine', origin: ctx.origin },
  })

  return vendorMode() === 'mock' ? { challenge, devCode: code } : { challenge }
}

/**
 * True only when `code` is the one issued for this phone under this challenge and the challenge
 * is under ten minutes old. Verification attempts are rate-limited per phone too: with no server
 * state, that limit is the only thing between a six-digit code and a brute force.
 */
export async function verifyOtp(phoneE164: string, code: string, challenge: string): Promise<boolean> {
  const phoneHash = hashPhone(phoneE164, phonePepper())
  if (!limiter.hit(`verify:${phoneHash}`)) throw new RateLimitedError()
  if (!/^\d{6}$/.test(code)) return false

  const parts = challenge.split('.')
  if (parts.length !== 2) return false
  const [payload, tag] = parts as [string, string]

  let claims: unknown
  try {
    claims = JSON.parse(Buffer.from(payload, 'base64url').toString())
  } catch {
    return false
  }
  if (typeof claims !== 'object' || claims === null) return false
  const { p, e } = claims as { p?: unknown; e?: unknown }
  if (p !== phoneHash || typeof e !== 'number' || e < Date.now()) return false

  const expected = mac(`${payload}.${code}`)
  const given = Buffer.from(tag, 'base64url')
  return given.length === expected.length && timingSafeEqual(given, expected)
}
