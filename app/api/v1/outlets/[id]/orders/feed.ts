import { getSession } from '@/auth/session.ts'
import { getOutlet, listBoardOrdersSince, orderNumbers } from '@/db/repos/index.ts'
import { toCardWire, type CardWire } from '@/ui/orderWire.ts'

/** Shared by the SSE stream and its 5-second polling fallback (Build Spec §7). */
export type Feed = { at: string; orders: CardWire[] }

/** The outlet, if the staff cookie belongs to its restaurant. Anything else is a 404: no enumeration. */
export async function authorisedOutlet(outletId: string) {
  const session = await getSession('staff')
  if (!session?.restaurantId) return null
  const outlet = await getOutlet(outletId)
  return outlet && outlet.restaurantId === session.restaurantId ? outlet : null
}

export async function changesSince(outletId: string, since: Date): Promise<Feed> {
  const at = new Date()
  const rows = await listBoardOrdersSince(outletId, since)
  const numbers = rows.length ? await orderNumbers(outletId, rows) : new Map<string, number>()
  return { at: at.toISOString(), orders: rows.map((r) => toCardWire(r, numbers.get(r.id))) }
}

export function parseSince(url: string): Date {
  const raw = new URL(url).searchParams.get('since')
  const d = raw ? new Date(raw) : new Date()
  return Number.isNaN(d.getTime()) ? new Date() : d
}
