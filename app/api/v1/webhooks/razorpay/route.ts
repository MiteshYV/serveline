import { payments } from '@/adapters/payments/index.ts'
import { markPaid } from '@/db/repos/index.ts'

export const dynamic = 'force-dynamic'

/**
 * POST /api/v1/webhooks/razorpay — Build Spec §9: "verified and idempotent". The adapter
 * verifies the signature over the raw body and parses the event; `markPaid` is idempotent and
 * answers with a value for anything it will not act on, so after verification the gateway
 * always gets a 2xx — it retries on anything else, forever.
 *
 * What `payment.webhook_payload` (Build Spec §4) keeps is the projection in `projectWebhook`,
 * not the event verbatim: that table is not one of the four allowed a phone number.
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

  const result = await markPaid(event.linkId, event.paymentId, event.amountPaise, projectWebhook(rawBody))
  console.info(`[webhook] ${event.event} ${event.linkId} → ${result.ok ? (result.alreadyPaid ? 'already paid' : 'paid') : result.reason}`)
  return Response.json(result)
}

/**
 * The fields of a payment_link.paid event that `payment.webhook_payload` keeps — an allow-list,
 * not a strip. A real event carries the customer's phone in more places than
 * `payment.entity.contact`: `payment_link.entity.customer`, `payment.entity.vpa` (a UPI VPA is
 * routinely `<mobile>@upi`), both `notes` objects, the card block, and whatever Razorpay adds
 * next; CLAUDE.md allows a phone number on four tables and `payment` is not one of them, so
 * anything not named here is dropped. The names are Razorpay's own, a superset of what
 * `parseRazorpayWebhook` reads, so a stored row can be re-parsed.
 */
const KEPT = {
  payment_link: ['id', 'status', 'amount', 'amount_paid', 'currency'],
  payment: ['id', 'status', 'amount', 'currency', 'method', 'created_at'],
} as const

type Obj = Record<string, unknown>
const obj = (v: unknown): Obj => (typeof v === 'object' && v !== null ? (v as Obj) : {})
const pick = (v: unknown, keys: readonly string[]): Obj => {
  const src = obj(v)
  return Object.fromEntries(keys.filter((k) => k in src).map((k) => [k, src[k]]))
}

function projectWebhook(rawBody: string): Obj {
  const ev = obj(JSON.parse(rawBody)) // the adapter has already parsed it once, so this cannot throw
  const payload = obj(ev.payload)
  return {
    ...pick(ev, ['event', 'created_at']),
    payload: {
      payment_link: { entity: pick(obj(payload.payment_link).entity, KEPT.payment_link) },
      payment: { entity: pick(obj(payload.payment).entity, KEPT.payment) },
    },
  }
}
