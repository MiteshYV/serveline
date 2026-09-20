import { relations } from 'drizzle-orm'
import { type AnyPgColumn, boolean, index, integer, jsonb, pgEnum, pgTable, primaryKey, real, text, varchar } from 'drizzle-orm/pg-core'
import { createdAt, fk, id, nullableFk, utc } from './_shared.ts'
import { customer } from './customers.ts'
import { language } from './enums.ts'
import { order } from './orders.ts'
import { outlet } from './tenancy.ts'

// Build Spec §4 "Calls". M2 (docs/superpowers/specs/2026-09-20-serveline-m2-design.md).

export const answeredBy = pgEnum('answered_by', ['ai', 'fallback_human', 'none'])
export const callIntent = pgEnum('call_intent', ['order', 'enquiry', 'other', 'unknown'])
export const callOutcome = pgEnum('call_outcome', [
  'completed', 'handoff', 'abandoned', 'deflected_sms', 'failed', 'cap_transfer',
])
export const callSpeaker = pgEnum('call_speaker', ['customer', 'ai'])
/**
 * Not in Build Spec §4. Build Spec §12 defines the completion rate over real calls; browser demo
 * calls must be separable from Exotel calls or the metric lies the day a restaurant goes live.
 */
export const callTransport = pgEnum('call_transport', ['browser', 'exotel'])
/** M4's call review tags the failure so a vocabulary alias can be added in place (Build Spec §8). */
export const callTag = pgEnum('call_tag', ['misheard_item', 'address', 'intent', 'vendor', 'complaint', 'other'])

export const call = pgTable('call', {
  id: id(),
  outletId: fk('outlet_id').references(() => outlet.id, { onDelete: 'cascade' }),
  transport: callTransport('transport').notNull(),
  /** Exotel's call sid, or the browser session id. */
  providerCallSid: varchar('provider_call_sid', { length: 64 }),
  /**
   * Build Spec §4 lists `from_phone` here too. It is deliberately absent: §15 forbids a phone number
   * outside customer, staff_user, platform_user and outlet, and CLAUDE.md enforces that. The
   * customer link carries the number when a human needs it.
   */
  fromPhoneHash: varchar('from_phone_hash', { length: 64 }),
  customerId: nullableFk('customer_id').references(() => customer.id, { onDelete: 'set null' }),
  startedAt: utc('started_at').notNull().defaultNow(),
  answeredBy: answeredBy('answered_by').notNull().default('ai'),
  languageDetected: language('language_detected'),
  intent: callIntent('intent').notNull().default('unknown'),
  outcome: callOutcome('outcome'),
  handoffReason: text('handoff_reason'),
  /** Same lazy-thunk cycle as orders ↔ winback; see orders.ts. */
  orderId: nullableFk('order_id').references((): AnyPgColumn => order.id, { onDelete: 'set null' }),
  durationSec: integer('duration_sec'),
  /** Ideation §10: answered by the AI and long enough to be a conversation. */
  countsTowardAllowance: boolean('counts_toward_allowance').notNull().default(false),
  tag: callTag('tag'),
  endedAt: utc('ended_at'),
}, (t) => [
  // Build Spec §4 names this one; the ledger and the completion metric read it.
  index('call_outlet_started_idx').on(t.outletId, t.startedAt),
  index('call_customer_idx').on(t.customerId),
])

export const callTurn = pgTable('call_turn', {
  id: id(),
  callId: fk('call_id').references(() => call.id, { onDelete: 'cascade' }),
  seq: integer('seq').notNull(),
  speaker: callSpeaker('speaker').notNull(),
  text: text('text').notNull(),
  language: language('language'),
  /** From the recogniser (browser or Sarvam); null for the AI's own turns. Build Spec §5.3 gates on it. */
  asrConfidence: real('asr_confidence'),
  startedMs: integer('started_ms'),
  endedMs: integer('ended_ms'),
  /** [{ name, args, result }] — every tool call the model made in this turn (Build Spec §5.5). */
  toolCalls: jsonb('tool_calls').notNull().default([]),
  createdAt: createdAt(),
}, (t) => [index('call_turn_call_seq_idx').on(t.callId, t.seq)])

/** Build Spec §4. All money in paise; STT/TTS/telephony stay zero for the browser transport. */
export const callCost = pgTable('call_cost', {
  callId: fk('call_id').references(() => call.id, { onDelete: 'cascade' }),
  telephonyPaise: integer('telephony_paise').notNull().default(0),
  sttPaise: integer('stt_paise').notNull().default(0),
  llmPaise: integer('llm_paise').notNull().default(0),
  ttsPaise: integer('tts_paise').notNull().default(0),
  smsPaise: integer('sms_paise').notNull().default(0),
  totalPaise: integer('total_paise').notNull().default(0),
  sttSeconds: integer('stt_seconds').notNull().default(0),
  ttsChars: integer('tts_chars').notNull().default(0),
  tokensIn: integer('tokens_in').notNull().default(0),
  tokensOut: integer('tokens_out').notNull().default(0),
}, (t) => [primaryKey({ columns: [t.callId] })])

export const callRelations = relations(call, ({ one, many }) => ({
  outlet: one(outlet, { fields: [call.outletId], references: [outlet.id] }),
  customer: one(customer, { fields: [call.customerId], references: [customer.id] }),
  order: one(order, { fields: [call.orderId], references: [order.id] }),
  turns: many(callTurn),
  cost: one(callCost, { fields: [call.id], references: [callCost.callId] }),
}))

export const callTurnRelations = relations(callTurn, ({ one }) => ({
  call: one(call, { fields: [callTurn.callId], references: [call.id] }),
}))
