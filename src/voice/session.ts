/**
 * Per-call state (M2 design, "Data" and session.ts in the architecture): the cart, the menu items
 * the model has been shown, the strikes the guardrails count, the message history. Keyed by call
 * id; the loop creates it at session-init and deletes it at end.
 *
 * Nothing here is persisted. The `call` row and its turns are the record; this is the working
 * memory of one conversation and dies with it.
 */

import type { LlmMessage } from '../adapters/llm/index.ts'
import type { CartItemInput, PricedMenuItem } from '../core/cart.ts'
import type { Lang } from '../ui/i18n.ts'

export type Session = {
  callId: string
  outletId: string
  restaurantId: string
  transport: 'browser' | 'exotel'
  customerId: string | null
  phoneHash: string | null
  lang: Lang
  /** Ids and quantities only — priced on every read by core's `priceCart`, never stored priced. */
  cart: CartItemInput[]
  /** Build Spec §5.3 menu grounding: `add_to_cart` accepts an id only if it is in here. */
  seenItemIds: Set<string>
  /** The priced items `search_menu` returned, by id: what the cart prices against mid-call. */
  searchResults: Map<string, PricedMenuItem>
  addressId: string | null
  codeText: string | null
  turnCount: number
  /** The spoken consent notice has been read aloud in this call; record_consent refuses until it has. */
  noticeRead: boolean
  strikes: { abuse: number; lowConfidence: number; llmFailures: number }
  provider: 'primary' | 'secondary'
  messages: LlmMessage[]
  startedAt: Date
  ended: boolean
}

// ponytail: an in-process Map is the ceiling — one Node process, which is all the browser
// transport needs. Build Spec §3 wants Redis (the API "owns cart state in Redis keyed by call
// id"), and it arrives with the Python transport, which is the first thing that runs in a second
// process. Held on globalThis for the same reason as src/db/client.ts and the SMS mock: Next's
// dev server gives each route bundle its own module instance, and session-init and turn are
// different routes.
const g = globalThis as unknown as { __serveline_voice_sessions?: Map<string, Session> }
const sessions = (g.__serveline_voice_sessions ??= new Map<string, Session>())

export function createSession(init: {
  callId: string
  outletId: string
  restaurantId: string
  transport: Session['transport']
  customerId?: string | null
  phoneHash?: string | null
  lang?: Lang
}): Session {
  const session: Session = {
    callId: init.callId,
    outletId: init.outletId,
    restaurantId: init.restaurantId,
    transport: init.transport,
    customerId: init.customerId ?? null,
    phoneHash: init.phoneHash ?? null,
    lang: init.lang ?? 'en',
    cart: [],
    seenItemIds: new Set(),
    searchResults: new Map(),
    addressId: null,
    codeText: null,
    turnCount: 0,
    noticeRead: false,
    strikes: { abuse: 0, lowConfidence: 0, llmFailures: 0 },
    provider: 'primary',
    messages: [],
    startedAt: new Date(),
    ended: false,
  }
  sessions.set(session.callId, session)
  return session
}

export const getSession = (callId: string): Session | null => sessions.get(callId) ?? null

export function deleteSession(callId: string): void {
  sessions.delete(callId)
}
