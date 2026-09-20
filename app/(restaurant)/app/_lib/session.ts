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
  // Build Spec §8: an admin suspension stops the dashboard too, not only the ordering page. The
  // flag is for the login page to say why, rather than offer a sign-in that leads straight back.
  if (restaurant.status === 'suspended') redirect('/app/login?suspended=1')
  const outlet = restaurant.outlets[0]
  if (!outlet) throw new Error('Restaurant has no outlet; the seed or the agent console creates one')
  const actor: Actor = { type: 'staff', id: session.subjectId }
  return { session, restaurant, outlet, actor }
})
