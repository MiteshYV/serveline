'use server'

import { redirect } from 'next/navigation'
import { getSession } from '@/auth/session.ts'
import { withdrawConsent } from '@/db/repos/index.ts'
import { loadRestaurant } from '../../lib.ts'

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
