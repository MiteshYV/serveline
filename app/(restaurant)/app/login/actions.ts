'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { issueOtp, RateLimitedError, verifyOtp } from '@/auth/otp.ts'
import { phonePepper } from '@/auth/secrets.ts'
import { createSession } from '@/auth/session.ts'
import { hashPhone, normalisePhone } from '@/core/phone.ts'
import { findStaffByPhoneHash, touchLastLogin } from '@/db/repos/index.ts'
import type { DashKey } from '@/ui/i18n-dashboard.ts'
import type { UiKey } from '@/ui/i18n.ts'

/** Build Spec §7: "Phone OTP login for staff_user." Two steps, one reducer-style action. */
export type LoginState =
  | { step: 'phone'; error?: LoginError }
  | { step: 'otp'; phone: string; challenge: string; devCode?: string; availableAt: number; error?: LoginError }

/** Keys, not sentences: the form renders them in the operator's language. */
export type LoginError = { key: UiKey | DashKey; dict: 'ui' | 'dash'; persistent?: boolean }

const RESEND_AFTER_MS = 30_000

const Send = z.object({ phone: z.string().min(1) })
const Verify = z.object({ phone: z.string().min(1), challenge: z.string().min(1), code: z.string().regex(/^\d{6}$/) })

export async function loginAction(prev: LoginState, form: FormData): Promise<LoginState> {
  const intent = form.get('intent')
  if (intent === 'back') return { step: 'phone' }
  if (intent === 'send') return send(form)
  if (intent === 'verify') return verify(prev, form)
  return { step: 'phone' }
}

async function send(form: FormData): Promise<LoginState> {
  const parsed = Send.safeParse({ phone: form.get('phone') })
  let phone: string
  try {
    phone = normalisePhone(parsed.success ? parsed.data.phone : '')
  } catch {
    return { step: 'phone', error: { key: 'login.phoneInvalid', dict: 'ui' } }
  }

  // Looked up before the SMS goes out: a stranger's number costs nothing and learns nothing
  // beyond "not staff here", which the door of the restaurant already tells them.
  const staff = await findStaffByPhoneHash(undefined, hashPhone(phone, phonePepper()))
  if (!staff) return { step: 'phone', error: { key: 'login.noAccount', dict: 'dash' } }

  const h = await headers()
  try {
    const { challenge, devCode } = await issueOtp(phone, {
      origin: h.get('host') ?? 'localhost',
      ip: h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? undefined,
    })
    return {
      step: 'otp',
      phone,
      challenge,
      ...(devCode ? { devCode } : {}),
      availableAt: Date.now() + RESEND_AFTER_MS,
    }
  } catch (e) {
    if (e instanceof RateLimitedError) {
      return { step: 'phone', error: { key: 'login.rateLimited', dict: 'dash', persistent: true } }
    }
    throw e
  }
}

async function verify(prev: LoginState, form: FormData): Promise<LoginState> {
  const parsed = Verify.safeParse({ phone: form.get('phone'), challenge: form.get('challenge'), code: form.get('code') })
  const otpState = prev.step === 'otp' ? prev : null
  if (!parsed.success || !otpState) {
    return otpState ? { ...otpState, error: { key: 'otp.wrong', dict: 'ui' } } : { step: 'phone' }
  }
  const { phone, challenge, code } = parsed.data

  let ok: boolean
  try {
    ok = await verifyOtp(phone, code, challenge)
  } catch (e) {
    if (e instanceof RateLimitedError) return { ...otpState, error: { key: 'login.rateLimited', dict: 'dash', persistent: true } }
    throw e
  }
  if (!ok) return { ...otpState, error: { key: 'otp.wrong', dict: 'ui' } }

  const staff = await findStaffByPhoneHash(undefined, hashPhone(phone, phonePepper()))
  if (!staff) return { step: 'phone', error: { key: 'login.noAccount', dict: 'dash' } }

  await createSession({ audience: 'staff', subjectId: staff.id, restaurantId: staff.restaurantId, role: staff.role })
  await touchLastLogin(staff.id)
  redirect('/app')
}
