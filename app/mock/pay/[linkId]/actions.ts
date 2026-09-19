'use server'

import { headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { vendorMode } from '@/adapters/mode.ts'
import { mockPayments } from '@/adapters/payments/mock.ts'
import { getOrder, getRestaurant } from '@/db/repos/index.ts'

/**
 * "Pay": the mock marks the link paid and delivers the signed webhook to our own webhook route
 * over HTTP — the same route, the same verification, the same idempotency the real gateway
 * hits — then sends the customer to the status page (the acceptance path, Build Spec §14 M1).
 */
export async function payMock(formData: FormData): Promise<void> {
  if (vendorMode() !== 'mock') notFound()
  const linkId = String(formData.get('linkId') ?? '')
  const link = mockPayments.get(linkId)
  if (!link) notFound()

  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000'
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')

  const { rawBody, signature } = mockPayments.markPaid(linkId)
  const res = await fetch(`${proto}://${host}/api/v1/webhooks/razorpay`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-razorpay-signature': signature },
    body: rawBody,
  })
  if (!res.ok) throw new Error(`Mock webhook delivery failed: HTTP ${res.status}`)

  const [order, restaurant] = await Promise.all([getOrder(link.orderId), getRestaurant(link.restaurantId)])
  if (!order || !restaurant) notFound()
  redirect(`/r/${restaurant.slug}/order/${order.id}`)
}
