import { notFound } from 'next/navigation'
import { getMenuForEditing, getRestaurant } from '@/db/repos/index.ts'

/**
 * What every editor page needs: the restaurant, the outlet in question (`?outlet=`, else the
 * oldest — the same choice `/r/{slug}` makes) and that outlet's menu tree, draft included.
 */
export async function loadEditor(restaurantId: string, outletParam: string | string[] | undefined) {
  const restaurant = await getRestaurant(restaurantId)
  if (!restaurant) notFound()
  const wanted = Array.isArray(outletParam) ? outletParam[0] : outletParam
  const outlet = restaurant.outlets.find((o) => o.id === wanted) ?? restaurant.outlets[0] ?? null
  const tree = outlet ? await getMenuForEditing(outlet.id) : null
  const menuHref = outlet ? `/agent/restaurants/${restaurantId}/menu?outlet=${outlet.id}` : `/agent/restaurants/${restaurantId}/menu`
  return { restaurant, outlet, tree, menuHref }
}
