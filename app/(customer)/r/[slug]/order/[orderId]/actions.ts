'use server'

import { redirect } from 'next/navigation'
import { vendorMode } from '@/adapters/mode.ts'
import { closeLinks, payments } from '@/adapters/payments/index.ts'
import { getSession } from '@/auth/session.ts'
import { isTerminal } from '@/core/orders.ts'
import { attachPayment, getOrder, supersedeOutstandingPayments, withdrawConsent } from '@/db/repos/index.ts'
import { loadRestaurant } from '../../lib.ts'

/**
 * Design §7.10.4 "Try again": a fresh link once the last one has expired (Build Spec §9: a
 * Payment Link lives 30 minutes). The same createLink → attachPayment pair as place-order. The
 * customer is on the status page, so the new link shows there and no SMS is sent. What happens to
 * the older awaiting rows is attachPayment's concern; closing them at the gateway is this one's.
 */
export async function reissuePaymentLinkAction(formData: FormData): Promise<void> {
  const slug = String(formData.get('slug') ?? '')
  const orderId = String(formData.get('orderId') ?? '')
  if (!/^[a-z0-9-]{1,64}$/.test(slug) || !/^[0-9a-f-]{36}$/.test(orderId)) return

  const session = await getSession('customer')
  if (!session) return
  const [{ restaurant }, order] = await Promise.all([loadRestaurant(slug), getOrder(orderId)])
  // The status page's own visibility rule: the customer whose session placed it, nobody else.
  if (!order || order.restaurantId !== restaurant.id || !order.customerId || order.customerId !== session.subjectId) return
  if (order.paymentMethod !== 'upi_link' || order.paymentStatus !== 'awaiting' || isTerminal(order.status)) return

  // Closing the old one at the gateway is this action's concern too: two live links mean a
  // customer who taps both is charged twice (finding superseded-payment-link-still-payable).
  const actor = { type: 'customer' as const, id: session.subjectId }
  await closeLinks(await supersedeOutstandingPayments(order.id, actor))
  const link = await payments().createLink({
    orderId: order.id,
    amountPaise: order.totalPaise,
    restaurantId: restaurant.id,
    description: `${restaurant.name} order`,
  })
  await attachPayment(
    { orderId: order.id, gateway: vendorMode() === 'mock' ? 'mock' : 'razorpay', linkId: link.linkId, amountPaise: order.totalPaise },
    actor,
  )
  redirect(`/r/${slug}/order/${orderId}`)
}

/**
 * Build Spec §10: "Withdrawal is a one-tap action on the ordering page." Closes every open grant
 * for this customer at this restaurant. The order already placed is unaffected (the notice says
 * so); the profile stops accruing from here.
 */
export async function withdrawConsentAction(formData: FormData): Promise<void> {
  const slug = String(formData.get('slug') ?? '')
  const orderId = String(formData.get('orderId') ?? '')
  if (!/^[a-z0-9-]{1,64}$/.test(slug) || !/^[0-9a-f-]{36}$/.test(orderId)) return

  const session = await getSession('customer')
  if (!session) return
  const { restaurant } = await loadRestaurant(slug)
  await withdrawConsent(session.subjectId, restaurant.id, { type: 'customer', id: session.subjectId })
  redirect(`/r/${slug}/order/${orderId}?withdrawn=1`)
}
