import { payments } from '@/adapters/payments/index.ts'
import { markPaid } from '@/db/repos/index.ts'

export const dynamic = 'force-dynamic'

/**
 * POST /api/v1/webhooks/razorpay — Build Spec §9: "verified and idempotent". The adapter
 * verifies the signature over the raw body and parses the event; `markPaid` is idempotent and
 * answers with a value for anything it will not act on, so after verification the gateway
 * always gets a 2xx — it retries on anything else, forever.
 *
 * The payload is stored verbatim on `payment.webhook_payload` (Build Spec §4) minus the
 * customer's contact and email: that table is not one of the four allowed a phone number.
 */
export async function POST(req: Request) {
  const rawBody = await req.text()
  const adapter = payments()
  if (!adapter.verifyWebhook(rawBody, req.headers.get('x-razorpay-signature') ?? '')) {
    return new Response('bad signature', { status: 401 })
  }

  let event: ReturnType<typeof adapter.parseWebhook>
  try {
    event = adapter.parseWebhook(rawBody)
  } catch {
    return new Response('bad body', { status: 400 })
  }
  // payment_link.paid is authoritative; a bare payment.captured has no link id to join on.
  if (event.event !== 'payment_link.paid' || !event.linkId) return Response.json({ ok: true, ignored: true })

  const result = await markPaid(event.linkId, event.paymentId, event.amountPaise, stripContact(JSON.parse(rawBody)))
  console.info(`[webhook] ${event.event} ${event.linkId} → ${result.ok ? (result.alreadyPaid ? 'already paid' : 'paid') : result.reason}`)
  return Response.json(result)
}

function stripContact(payload: unknown): unknown {
  if (typeof payload !== 'object' || payload === null) return payload
  const p = payload as { payload?: { payment?: { entity?: Record<string, unknown> } } }
  const entity = p.payload?.payment?.entity
  if (entity) {
    delete entity.contact
    delete entity.email
  }
  return payload
}
