import { getSession } from '@/auth/session.ts'
import { getOrder } from '@/db/repos/index.ts'

export const dynamic = 'force-dynamic'

/**
 * GET /api/v1/orders/{id}/status — what the status page polls (Build Spec §6). Same visibility
 * rule as the page: the customer session that placed the order, or 404.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/.test(id)) return new Response(null, { status: 404 })
  const [session, order] = await Promise.all([getSession('customer'), getOrder(id)])
  if (!order || !session || order.customerId !== session.subjectId) return new Response(null, { status: 404 })
  return Response.json(
    { status: order.status, paymentStatus: order.paymentStatus, fulfilment: order.fulfilment },
    { headers: { 'cache-control': 'no-store' } },
  )
}
