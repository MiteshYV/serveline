import { redirect } from 'next/navigation'
import { cache } from 'react'
import { requireStaff } from '@/auth/session.ts'
import { getRestaurant } from '@/db/repos/index.ts'
import type { Actor } from '@/db/repos/ops.ts'

/**
 * The dashboard's request context: the staff session, its restaurant and the outlet the board
 * shows. Build Spec §7 is single-outlet at M1 (multi-location dashboards do not ship, Ideation
 * §11), so the outlet is the restaurant's first. Cached per request, so the layout and the page
 * share one lookup.
 */
export const currentOutlet = cache(async () => {
  const session = await requireStaff()
  const restaurant = await getRestaurant(session.restaurantId)
  if (!restaurant) redirect('/app/login')
  const outlet = restaurant.outlets[0]
  if (!outlet) throw new Error('Restaurant has no outlet; the seed or the agent console creates one')
  const actor: Actor = { type: 'staff', id: session.subjectId }
  return { session, restaurant, outlet, actor }
})
