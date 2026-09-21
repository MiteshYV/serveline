'use server'

import { headers } from 'next/headers'
import { z } from 'zod'
import { requirePlatform } from '@/auth/session.ts'
import { getCustomer, type ToolCallRecord } from '@/db/repos/index.ts'
import type { Lang } from '@/ui/i18n.ts'
import { endCall, startCall, takeTurn } from '@/voice/loop.ts'

/**
 * The text simulator's three moves (M2 design "Surfaces": "pick an outlet and a caller phone,
 * type, read. Every simulator call is a real call row with transport = browser"). They call
 * src/voice/loop.ts directly — no HTTP, the platform session authorises — and hand the loop the
 * chosen customer's phone hash, as the Exotel transport will hand it the caller's CLI hash.
 */

const LANG = z.enum(['hi', 'en', 'kn'])
const start = z.object({ outletId: z.uuid(), customerId: z.uuid().nullable(), lang: LANG })
const turn = z.object({ callId: z.uuid(), text: z.string().trim().min(1).max(500), lang: LANG })
const end = z.object({ callId: z.uuid() })

export type StartResult = { ok: true; callId: string; greeting: string; lang: Lang } | { ok: false; error: string }
export type TurnReply =
  | { ok: true; reply: string; lang: Lang; toolCalls: ToolCallRecord[]; ended: boolean; outcome?: string; orderId?: string }
  | { ok: false; error: string; ended: boolean }

// Calls this console started. A platform session may type into a call it opened here and into
// no other: a mic-page call belongs to its customer, and an agent must not be able to speak into
// one. Same store and lifetime as the session (session.ts's ponytail note on Redis applies).
const g = globalThis as unknown as { __serveline_simulator_calls?: Set<string> }
const simulated = (g.__serveline_simulator_calls ??= new Set<string>())

/** This deployment's origin, for the links in SMS and tool results — the same three lines as the customer page's `origin()`. */
async function origin(): Promise<string> {
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000'
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  return `${proto}://${host}`
}

const message = (e: unknown) => (e instanceof Error ? e.message : 'unknown error')

export async function startSimulatedCall(input: unknown): Promise<StartResult> {
  await requirePlatform()
  const parsed = start.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Pick an outlet, a caller and a language.' }
  const caller = parsed.data.customerId ? await getCustomer(parsed.data.customerId) : null
  if (parsed.data.customerId && !caller) return { ok: false, error: 'That customer no longer exists.' }
  try {
    const started = await startCall({
      outletId: parsed.data.outletId,
      transport: 'browser',
      customerPhoneHash: caller?.phoneHash,
      lang: parsed.data.lang,
      origin: await origin(),
    })
    simulated.add(started.callId)
    return { ok: true, ...started }
  } catch (e) {
    return { ok: false, error: message(e) }
  }
}

export async function sendSimulatedTurn(input: unknown): Promise<TurnReply> {
  await requirePlatform()
  const parsed = turn.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Type something first — up to 500 characters.', ended: false }
  if (!simulated.has(parsed.data.callId)) {
    return { ok: false, error: 'Not a simulator call, or the server restarted since it began. Start a new call.', ended: true }
  }
  try {
    const result = await takeTurn(parsed.data.callId, { text: parsed.data.text, lang: parsed.data.lang })
    if (result.ended) simulated.delete(parsed.data.callId)
    return { ok: true, ...result }
  } catch (e) {
    // The loop has already ended the call `failed` (M2 design "Error handling"); the agent sees why.
    simulated.delete(parsed.data.callId)
    return { ok: false, error: `The call ended failed: ${message(e)}`, ended: true }
  }
}

export async function endSimulatedCall(input: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  await requirePlatform()
  const parsed = end.safeParse(input)
  if (!parsed.success || !simulated.has(parsed.data.callId)) return { ok: false, error: 'Not a simulator call.' }
  await endCall(parsed.data.callId, 'simulator_hangup')
  simulated.delete(parsed.data.callId)
  return { ok: true }
}
