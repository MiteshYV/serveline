'use server'

import { createHash } from 'node:crypto'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { issueOtp, RateLimitedError, verifyOtp } from '@/auth/otp.ts'
import { phonePepper } from '@/auth/secrets.ts'
import { createSession, getSession } from '@/auth/session.ts'
import { placeOrder, type PlaceOrderResult } from '@/checkout/place-order.ts'
import { hasValidConsent, NOTICE_VERSION } from '@/core/consent.ts'
import { hashPhone, normalisePhone } from '@/core/phone.ts'
import { checkServiceability } from '@/core/serviceability.ts'
import {
  findCustomerByPhoneHash, getConsent, getCustomer, recordConsent, saveAddress, upsertCustomer, upsertCustomerRestaurant,
} from '@/db/repos/index.ts'
import type { UiKey } from '@/ui/i18n.ts'
import { clientIp, contextQuery, currentLang, loadRestaurant, origin, parseContext, withQuery } from '../lib.ts'
import { clearOtp, readOtp, writeOtp } from './otp-cookie.ts'

// Every action gets back to the checkout URL it came from; the context is re-parsed from the
// hidden `qs` field, so a tampered value degrades to plain delivery rather than to anything else.
const str = (v: FormDataEntryValue | null) => (typeof v === 'string' ? v : '')

function where(formData: FormData) {
  const slug = str(formData.get('slug'))
  if (!/^[a-z0-9-]{1,64}$/.test(slug)) throw new Error('Bad slug')
  const ctx = parseContext(Object.fromEntries(new URLSearchParams(str(formData.get('qs')))))
  const qs = contextQuery(ctx)
  const back = (...extra: string[]) => withQuery(`/r/${slug}/checkout`, qs, ...extra) as `/r/${string}/checkout`
  return { slug, ctx, qs, back }
}

/** Phone step, and the OTP step's resend (no `phone` field: the pending cookie's number is reused). */
export async function sendCode(formData: FormData): Promise<void> {
  const { slug, back } = where(formData)
  const typed = str(formData.get('phone'))
  let phone: string
  try {
    phone = typed ? normalisePhone(typed) : ((await readOtp())?.p ?? '')
    if (!phone) redirect(back('err=phone'))
  } catch {
    redirect(back('err=phone'))
  }

  const [{ restaurant }, lang, host, ip] = await Promise.all([loadRestaurant(slug), currentLang(), origin(), clientIp()])
  let issued: Awaited<ReturnType<typeof issueOtp>>
  try {
    issued = await issueOtp(phone, { origin: new URL(host).host, restaurant: restaurant.name, language: lang, ip })
  } catch (error) {
    if (error instanceof RateLimitedError) redirect(back('err=ratelimit'))
    throw error
  }
  await writeOtp({ p: phone, ch: issued.challenge, at: Date.now(), ...(issued.devCode ? { dev: issued.devCode } : {}) })
  redirect(back())
}

export type VerifyState = { error: UiKey | null; attempt: number; code: string }

/** OTP step (useActionState). On success the customer exists, has a 30-day session, and is sent on. */
export async function verifyCode(prev: VerifyState, formData: FormData): Promise<VerifyState> {
  const { back } = where(formData)
  const code = str(formData.get('code')).trim()
  const pending = await readOtp()
  if (!pending) return { error: 'checkout.otpExpired', attempt: prev.attempt + 1, code }

  let ok: boolean
  try {
    ok = await verifyOtp(pending.p, code, pending.ch)
  } catch (error) {
    if (error instanceof RateLimitedError) return { error: 'checkout.rateLimited', attempt: prev.attempt + 1, code }
    throw error
  }
  if (!ok) return { error: 'otp.wrong', attempt: prev.attempt + 1, code }

  const phoneHash = hashPhone(pending.p, phonePepper())
  const existing = await findCustomerByPhoneHash(phoneHash)
  const customer = await upsertCustomer(
    { phone: pending.p, phoneHash, preferredLanguage: await currentLang() },
    { type: 'customer', id: existing?.id ?? null },
  )
  await createSession({ audience: 'customer', subjectId: customer.id })
  await clearOtp()
  redirect(back())
}

async function requireCustomer() {
  const session = await getSession('customer')
  const customer = session ? await getCustomer(session.subjectId) : null
  return customer
}

/**
 * Consent step (Build Spec §10): one row per grant, channel `page`, evidence = a request id and
 * a hash of the IP — never the number. A page grant covers the three purposes a page order can
 * exercise; `call_recording` is granted on a call (contracts/notices/README.md).
 */
export async function grantConsent(formData: FormData): Promise<void> {
  const { slug, ctx, back } = where(formData)
  if (formData.get('agree') !== 'on') redirect(back('err=consent'))
  const customer = await requireCustomer()
  if (!customer) redirect(back())

  const [{ restaurant }, lang, ip] = await Promise.all([loadRestaurant(slug), currentLang(), clientIp()])
  const actor = { type: 'customer' as const, id: customer.id }
  const consent = await recordConsent({
    customerId: customer.id,
    restaurantId: restaurant.id,
    noticeVersion: NOTICE_VERSION,
    purposes: ['order_fulfilment', 'order_history', 'personalisation'],
    channel: 'page',
    language: lang,
    evidence: { requestId: crypto.randomUUID(), ipHash: createHash('sha256').update(`ip:${ip ?? 'unknown'}`).digest('hex') },
  }, actor)
  await upsertCustomerRestaurant({
    customerId: customer.id,
    restaurantId: restaurant.id,
    source: ctx.kind === 'table' ? 'table' : ctx.code ? 'win_back' : 'page',
    consentId: consent.id,
  }, actor)
  redirect(back())
}

const AddressForm = z.object({
  line1: z.string().trim().min(3).max(200),
  landmark: z.string().trim().max(120).optional(),
  area: z.string().trim().min(2).max(80),
  pincode: z.string().trim().regex(/^\d{6}$/),
})

/** Address step: line, landmark, area, pincode; serviceability on pincode (Build Spec §6). */
export async function saveAddressAction(formData: FormData): Promise<void> {
  const { slug, back } = where(formData)
  const customer = await requireCustomer()
  if (!customer) redirect(back())

  const parsed = AddressForm.safeParse({
    line1: formData.get('line1'), landmark: formData.get('landmark') || undefined,
    area: formData.get('area'), pincode: formData.get('pincode'),
  })
  if (!parsed.success) redirect(back('err=address'))

  const { restaurant, outlet } = await loadRestaurant(slug)
  const ok = checkServiceability({ pincode: parsed.data.pincode }, outlet)
  if (!ok.ok) redirect(back('err=pincode', `pin=${parsed.data.pincode}`))

  const row = await saveAddress({
    customerId: customer.id,
    restaurantId: restaurant.id,
    line1: parsed.data.line1,
    landmark: parsed.data.landmark ?? null,
    area: parsed.data.area,
    pincode: parsed.data.pincode,
    source: 'page',
    isConfirmed: true,
  }, { type: 'customer', id: customer.id })
  redirect(back(`a=${row.id}`))
}

const PlaceOrderPayload = z.object({
  slug: z.string().regex(/^[a-z0-9-]{1,64}$/),
  qs: z.string().max(64),
  items: z.array(z.object({
    itemId: z.string().uuid(),
    variantId: z.string().uuid().optional(),
    optionIds: z.array(z.string().uuid()).max(20),
    qty: z.number().int().min(1).max(20),
  })).min(1).max(50),
  paymentMethod: z.enum(['upi_link', 'cod', 'pay_at_table']),
  addressId: z.string().uuid().optional(),
})

export type PlaceOrderActionResult =
  | (PlaceOrderResult & { ok: true; statusUrl: string })
  | (PlaceOrderResult & { ok: false })
  | { ok: false; reason: 'not_signed_in' | 'consent_required' | 'bad_request' }

/**
 * Confirm step. The client sends ids and quantities; everything else — prices, discount, the
 * customer, the outlet — is resolved here and in src/checkout/place-order.ts.
 */
export async function placeOrderAction(payload: unknown): Promise<PlaceOrderActionResult> {
  const parsed = PlaceOrderPayload.safeParse(payload)
  if (!parsed.success) return { ok: false, reason: 'bad_request' }
  const { slug, qs, items, paymentMethod, addressId } = parsed.data

  const customer = await requireCustomer()
  if (!customer) return { ok: false, reason: 'not_signed_in' }

  const [{ restaurant, outlet }, lang, host] = await Promise.all([loadRestaurant(slug), currentLang(), origin()])
  // A session is not consent. Withdrawal is one tap and immediate (Build Spec §10), and a tab
  // opened before it still has this button — so the gate the checkout page renders by runs
  // again here, on the live record.
  const consent = await getConsent(customer.id, restaurant.id)
  const consentView = consent
    ? { noticeVersion: consent.noticeVersion, purposes: consent.purposes, withdrawnAt: consent.withdrawnAt }
    : undefined
  if (!hasValidConsent(consentView, 'order_fulfilment')) return { ok: false, reason: 'consent_required' }

  const context = parseContext(Object.fromEntries(new URLSearchParams(qs)))
  const result = await placeOrder({
    restaurant, outlet, customer, lang, context, items, paymentMethod, addressId, origin: host,
  })
  return result.ok ? { ...result, statusUrl: `/r/${slug}/order/${result.orderId}` } : result
}
