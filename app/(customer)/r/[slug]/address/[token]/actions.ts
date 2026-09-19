'use server'

import { createHash } from 'node:crypto'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { verifyAddressToken } from '@/auth/jwt.ts'
import { createSession } from '@/auth/session.ts'
import { hasValidConsent, NOTICE_VERSION } from '@/core/consent.ts'
import { checkServiceability } from '@/core/serviceability.ts'
import { confirmAddress, getConsent, getCustomer, getOrder, recordConsent, saveAddress } from '@/db/repos/index.ts'
import { clientIp, currentLang, loadRestaurant, withQuery } from '../../lib.ts'

const Form = z.object({
  line1: z.string().trim().min(3).max(200),
  landmark: z.string().trim().max(120).optional(),
  area: z.string().trim().min(2).max(80),
  pincode: z.string().trim().regex(/^\d{6}$/),
})

/**
 * Confirms the address for an `address_pending` order (Build Spec §6). The signed link proves
 * the phone as well as an OTP does, so the customer also gets a session and lands on the status
 * page. If no consent covers the address yet (a call that never reached the notice), the form
 * carried the notice and the tick, and the grant is recorded first — `saveAddress` refuses otherwise.
 */
export async function confirmAddressAction(formData: FormData): Promise<void> {
  const slug = String(formData.get('slug') ?? '')
  const token = String(formData.get('token') ?? '')
  if (!/^[a-z0-9-]{1,64}$/.test(slug)) throw new Error('Bad slug')
  const here = (...extra: string[]) => withQuery(`/r/${slug}/address/${token}`, ...extra) as `/r/${string}/address/${string}`

  const orderId = await verifyAddressToken(token)
  const order = orderId ? await getOrder(orderId) : null
  const customer = order?.customerId ? await getCustomer(order.customerId) : null
  const { restaurant, outlet } = await loadRestaurant(slug)
  if (!order || !customer || order.restaurantId !== restaurant.id || order.status !== 'address_pending') redirect(here())

  const parsed = Form.safeParse({
    line1: formData.get('line1'), landmark: formData.get('landmark') || undefined,
    area: formData.get('area'), pincode: formData.get('pincode'),
  })
  if (!parsed.success) redirect(here('err=address'))
  const ok = checkServiceability({ pincode: parsed.data.pincode }, outlet)
  if (!ok.ok) redirect(here('err=pincode', `pin=${parsed.data.pincode}`))

  const actor = { type: 'customer' as const, id: customer.id }
  const consent = await getConsent(customer.id, restaurant.id)
  const view = consent ? { noticeVersion: consent.noticeVersion, purposes: consent.purposes, withdrawnAt: consent.withdrawnAt } : undefined
  if (!hasValidConsent(view, 'order_fulfilment')) {
    if (formData.get('agree') !== 'on') redirect(here('err=consent'))
    const [lang, ip] = await Promise.all([currentLang(), clientIp()])
    await recordConsent({
      customerId: customer.id,
      restaurantId: restaurant.id,
      noticeVersion: NOTICE_VERSION,
      purposes: ['order_fulfilment', 'order_history', 'personalisation'],
      channel: 'page',
      language: lang,
      evidence: { requestId: crypto.randomUUID(), ipHash: createHash('sha256').update(`ip:${ip ?? 'unknown'}`).digest('hex') },
    }, actor)
  }

  const address = await saveAddress({
    customerId: customer.id,
    restaurantId: restaurant.id,
    line1: parsed.data.line1,
    landmark: parsed.data.landmark ?? null,
    area: parsed.data.area,
    pincode: parsed.data.pincode,
    source: 'page',
    isConfirmed: true,
  }, actor)
  await confirmAddress(order.id, address.id, actor)
  await createSession({ audience: 'customer', subjectId: customer.id })
  redirect(`/r/${slug}/order/${order.id}`)
}
