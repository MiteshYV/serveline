import { createHash, timingSafeEqual } from 'node:crypto'
import type { z } from 'zod'
import { getSession as getCookieSession } from '@/auth/session.ts'
import { getCall } from '@/db/repos/index.ts'
import { getSession as getVoiceSession, type Session } from '@/voice/session.ts'

/**
 * What the three voice routes share (M2 design "Architecture": `/api/v1/voice/*` is the Build
 * Spec §5.6 contract, spoken to by the browser today and the Python transport later).
 *
 * Two ways in. A customer session cookie — the mic page, where the caller has done the phone
 * step and the call is theirs alone — or `x-voice-token`, the §5.6 "service token" for a
 * transport that speaks for many callers. The token path exists only when VOICE_SERVICE_TOKEN
 * is set (.env.example): unset, the header is ignored and only a customer can call.
 */
export type Caller = { kind: 'customer'; customerId: string } | { kind: 'service' }

// Hashed before comparing so `timingSafeEqual` sees equal lengths; the hash is not stored.
const digest = (s: string) => createHash('sha256').update(s).digest()

export async function authenticate(req: Request): Promise<Caller | null> {
  const expected = process.env.VOICE_SERVICE_TOKEN
  const given = req.headers.get('x-voice-token')
  if (expected && given && timingSafeEqual(digest(given), digest(expected))) return { kind: 'service' }
  const session = await getCookieSession('customer')
  return session ? { kind: 'customer', customerId: session.subjectId } : null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/**
 * The live session for a call id, or the status to answer with: 404 for a call that does not
 * exist or is not this customer's (no enumeration, as the order status route has it), 409 for
 * one that has ended. A row with no session — the process restarted mid-call — is 409 too: the
 * conversation cannot continue (session.ts's ponytail note on Redis is the upgrade).
 */
export async function liveCall(id: string, caller: Caller): Promise<Session | 404 | 409> {
  if (!UUID.test(id)) return 404
  const session = getVoiceSession(id)
  if (session && !session.ended) {
    return caller.kind === 'service' || session.customerId === caller.customerId ? session : 404
  }
  const call = await getCall(id)
  if (!call || (caller.kind === 'customer' && call.customerId !== caller.customerId)) return 404
  return 409
}

export const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'cache-control': 'no-store' } })

/** Every boundary input through zod (CLAUDE.md). Issues come back as `path: message`, as tools.ts reports them. */
export async function parseBody<T extends z.ZodType>(
  req: Request,
  schema: T,
): Promise<{ ok: true; data: z.output<T> } | { ok: false; response: Response }> {
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return { ok: false, response: json({ error: 'bad_request', detail: ['body: not JSON'] }, 400) }
  }
  const parsed = schema.safeParse(raw)
  if (parsed.success) return { ok: true, data: parsed.data }
  const detail = parsed.error.issues.map((i) => `${i.path.join('.') || '(body)'}: ${i.message}`)
  return { ok: false, response: json({ error: 'bad_request', detail }, 400) }
}
