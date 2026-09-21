import { z } from 'zod'
import { getRestaurantBySlug } from '@/db/repos/index.ts'
import { startCall } from '@/voice/loop.ts'
import { authenticate, json, parseBody } from '../lib.ts'

export const dynamic = 'force-dynamic'

/**
 * POST /api/v1/voice/session-init — Build Spec §5.6's session-init, shaped for the browser
 * transport (M2 design "Surfaces"): the ordering page's slug rather than an outlet id, and the
 * caller from the customer cookie rather than a `from_phone` (the phone hash comes from the
 * customer row inside `startCall`, so no number crosses this boundary). The service-token path
 * starts an anonymous call; the transport that needs a caller identity arrives with M2b.
 *
 * Answers `{ callId, greeting, lang }`; the surface speaks the greeting and posts the first turn.
 */
const body = z.object({
  slug: z.string().min(1).max(64),
  transport: z.literal('browser'),
  lang: z.enum(['hi', 'en', 'kn']).optional(),
})

export async function POST(req: Request) {
  const caller = await authenticate(req)
  if (!caller) return json({ error: 'unauthorised' }, 401)
  const parsed = await parseBody(req, body)
  if (!parsed.ok) return parsed.response

  // The same rule as the ordering page (app/(customer)/r/[slug]/lib.ts): the first outlet, and a
  // suspended or churned restaurant is indistinguishable from one that never existed.
  const restaurant = await getRestaurantBySlug(parsed.data.slug)
  const outlet = restaurant?.outlets[0]
  if (!restaurant || !outlet || restaurant.status === 'suspended' || restaurant.status === 'churned') {
    return json({ error: 'not_found' }, 404)
  }

  // This deployment's origin, for the links in SMS and tool results — as the page's `origin()`.
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? 'localhost:3000'
  const proto = req.headers.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')

  return json(await startCall({
    outletId: outlet.id,
    transport: parsed.data.transport,
    customerId: caller.kind === 'customer' ? caller.customerId : undefined,
    lang: parsed.data.lang,
    origin: `${proto}://${host}`,
  }))
}
