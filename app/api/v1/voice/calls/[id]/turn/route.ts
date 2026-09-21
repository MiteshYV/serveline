import { z } from 'zod'
import { takeTurn } from '@/voice/loop.ts'
import { authenticate, json, liveCall, parseBody } from '../../../lib.ts'

export const dynamic = 'force-dynamic'

/**
 * POST /api/v1/voice/calls/{id}/turn — one caller utterance in, one reply out (M2 design "The
 * turn"). `confidence` and `lang` are what the browser recogniser reports; the simulator posts
 * text alone. Answers loop.ts's `TurnResult`: the reply to speak, the tool calls for the review
 * screen, and whether the call is over.
 *
 * ponytail: turns for one call are taken in the order they arrive and are not serialised here;
 * the browser posts one at a time, and the Exotel transport will too. A lock per call id comes
 * with the Redis session (session.ts).
 */
const body = z.object({
  text: z.string().trim().min(1).max(1000),
  lang: z.enum(['hi', 'en', 'kn']).optional(),
  confidence: z.number().min(0).max(1).optional(),
})

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const caller = await authenticate(req)
  if (!caller) return json({ error: 'unauthorised' }, 401)
  const parsed = await parseBody(req, body)
  if (!parsed.ok) return parsed.response

  const { id } = await params
  const live = await liveCall(id, caller)
  if (live === 404) return json({ error: 'not_found' }, 404)
  if (live === 409) return json({ error: 'ended' }, 409)

  try {
    return json(await takeTurn(live.callId, parsed.data))
  } catch {
    // A programmer error: the loop has already ended the call `failed` and logged its id (M2
    // design "Error handling"). Nothing of the request or the error is echoed.
    return json({ error: 'failed' }, 500)
  }
}
