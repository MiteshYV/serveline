'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { RateLimitedError, issueOtp, verifyOtp } from '@/auth/otp.ts'
import { phonePepper } from '@/auth/secrets.ts'
import { createSession } from '@/auth/session.ts'
import { hashPhone, normalisePhone } from '@/core/phone.ts'
import { findPlatformUserByPhoneHash } from '@/db/repos/index.ts'
import { t } from '@/ui/i18n.ts'

/**
 * Build Spec §8: "`platform_user` login", by phone OTP like every other login (§3). The number is
 * checked against `platform_user` BEFORE a code is sent: this is an internal tool with a handful
 * of accounts, and an SMS to a stranger's number is a cost with no upside.
 */

export type SendState = {
  error?: string
  /** True when the error is a rate limit — shown as a persistent band, not a field error (design §11.15). */
  limited?: boolean
  phone?: string
  challenge?: string
  /** Present only under VENDOR_MODE=mock (src/auth/otp.ts). */
  devCode?: string
  resendAt?: number
}

export type VerifyState = { error?: string; limited?: boolean }

const NOT_AGENT = 'This number is not a ServeLine agent account'
const RESEND_AFTER_MS = 30_000

const field = (fd: FormData, name: string): string => {
  const v = fd.get(name)
  return typeof v === 'string' ? v : ''
}

async function platformUserFor(phone: string) {
  return findPlatformUserByPhoneHash(hashPhone(phone, phonePepper()))
}

export async function sendCode(_prev: SendState, fd: FormData): Promise<SendState> {
  let phone: string
  try {
    phone = normalisePhone(field(fd, 'phone'))
  } catch {
    return { error: t('login.phoneInvalid', 'en') }
  }
  if (!(await platformUserFor(phone))) return { error: NOT_AGENT }

  const h = await headers()
  try {
    const { challenge, devCode } = await issueOtp(phone, {
      origin: h.get('host') ?? 'localhost',
      ip: h.get('x-forwarded-for')?.split(',')[0]?.trim(),
    })
    return { phone, challenge, devCode, resendAt: Date.now() + RESEND_AFTER_MS }
  } catch (e) {
    if (e instanceof RateLimitedError) return { error: e.message, limited: true }
    throw e
  }
}

const verifySchema = z.object({ phone: z.string(), challenge: z.string().min(1), code: z.string() })

export async function verifyCode(_prev: VerifyState, fd: FormData): Promise<VerifyState> {
  const parsed = verifySchema.safeParse({ phone: field(fd, 'phone'), challenge: field(fd, 'challenge'), code: field(fd, 'code') })
  if (!parsed.success) return { error: t('otp.label', 'en') }

  let phone: string
  try {
    phone = normalisePhone(parsed.data.phone)
  } catch {
    return { error: t('login.phoneInvalid', 'en') }
  }

  let ok: boolean
  try {
    ok = await verifyOtp(phone, parsed.data.code, parsed.data.challenge)
  } catch (e) {
    if (e instanceof RateLimitedError) return { error: e.message, limited: true }
    throw e
  }
  if (!ok) return { error: t('otp.wrong', 'en') }

  // Looked up again rather than trusted from a hidden field: the session is minted from the row.
  const user = await platformUserFor(phone)
  if (!user) return { error: NOT_AGENT }

  await createSession({ audience: 'platform', subjectId: user.id, role: user.role })
  redirect('/agent')
}
