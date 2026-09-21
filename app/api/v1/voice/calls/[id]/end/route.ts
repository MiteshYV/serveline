import { z } from 'zod'
import { endCall } from '@/voice/loop.ts'
import { authenticate, json, liveCall, parseBody } from '../../../lib.ts'

export const dynamic = 'force-dynamic'

/**
 * POST /api/v1/voice/calls/{id}/end — the surface hung up (Build Spec §5.6 "end"): the browser's
 * Call button, or the mic page's 30 s silence timeout (M2 design "Guardrails"). Idempotent like
 * `endCall` itself: a call the loop already closed — a handoff turn ended it a moment before the
 * page hung up — is answered `{ ended: true }` too, not 409, because that race is the ordinary
 * case rather than a client error. An unknown call is still 404.
 */
const body = z.object({ reason: z.string().trim().min(1).max(200) })

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const caller = await authenticate(req)
  if (!caller) return json({ error: 'unauthorised' }, 401)
  const parsed = await parseBody(req, body)
  if (!parsed.ok) return parsed.response

  const { id } = await params
  const live = await liveCall(id, caller)
  if (live === 404) return json({ error: 'not_found' }, 404)
  if (live !== 409) await endCall(live.callId, parsed.data.reason)
  return json({ ended: true })
}
