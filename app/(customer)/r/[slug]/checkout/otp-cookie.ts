import { cookies } from 'next/headers'

/**
 * Between "send code" and "verify": the phone (E.164) and the signed challenge from
 * src/auth/otp.ts, in one httpOnly cookie for the OTP's ten-minute life. It never goes in the
 * URL — URLs are logged, and CLAUDE.md allows no phone number in a log. `dev` is the code
 * itself, present only under VENDOR_MODE=mock so the page can show it (M1 design, "Adapters").
 */
export type OtpPending = { p: string; ch: string; at: number; dev?: string }

const NAME = 'sl_otp'
const TTL_SECONDS = 10 * 60

export async function writeOtp(pending: OtpPending): Promise<void> {
  ;(await cookies()).set(NAME, Buffer.from(JSON.stringify(pending)).toString('base64url'), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: TTL_SECONDS,
  })
}

export async function readOtp(): Promise<OtpPending | null> {
  const raw = (await cookies()).get(NAME)?.value
  if (!raw) return null
  try {
    const v = JSON.parse(Buffer.from(raw, 'base64url').toString()) as Partial<OtpPending>
    return typeof v.p === 'string' && typeof v.ch === 'string' && typeof v.at === 'number'
      ? { p: v.p, ch: v.ch, at: v.at, ...(typeof v.dev === 'string' ? { dev: v.dev } : {}) }
      : null
  } catch {
    return null
  }
}

export async function clearOtp(): Promise<void> {
  ;(await cookies()).delete(NAME)
}
