import { and, asc, desc, eq, getTableColumns, gte, isNull, lt, sql } from 'drizzle-orm'
import { paise } from '../../core/money.ts'
import { db } from '../client.ts'
import { call, callCost, callOutcome, callTag, callTransport, callTurn, customer, outlet, restaurant } from '../schema/index.ts'
import { type Actor, firstRow, guarded, writeAudit } from './ops.ts'

/**
 * The call aggregate: `call`, `call_turn`, `call_cost` (Build Spec §4 "Calls"; M2 design "Data"
 * and "Cost ledger"). Written by src/voice/loop.ts as a call runs; read by the agent console's
 * call list and review screen (M2 design "Surfaces").
 *
 * Only `tagCall` audits. A tag is a person's judgement written onto a row that links a customer,
 * so it goes through `writeAudit` like every other such write (CLAUDE.md). The turns and the
 * ledger are the call's own record, written by the system as the call happens — the same
 * standing as `sms_message` in ops.ts.
 *
 * No phone number reaches this file. `from_phone_hash` is a hash — the M2 design drops Build
 * Spec §4's `from_phone` for exactly this reason — and `createCall` refuses anything else.
 */

export type CallRow = typeof call.$inferSelect
export type CallTurnRow = typeof callTurn.$inferSelect
export type CallCostRow = typeof callCost.$inferSelect

// The enum values, for the console's filters and the tag <select> — pages read the repo, not the schema.
export const CALL_OUTCOMES = callOutcome.enumValues
export const CALL_TRANSPORTS = callTransport.enumValues
export const CALL_TAGS = callTag.enumValues

/** One entry of `call_turn.tool_calls`: Build Spec §5.5, every tool call logged with its arguments and result. */
export type ToolCallRecord = { name: string; args: unknown; result: unknown; ms: number }

const SHA256_HEX = /^[0-9a-f]{64}$/

export async function createCall(input: {
  outletId: string
  transport: CallRow['transport']
  providerCallSid?: string
  fromPhoneHash?: string
  customerId?: string
}): Promise<CallRow> {
  // The one-line guard for the four-tables rule (CLAUDE.md), as `logSms` has it: a number is 13
  // characters, a hash is 64.
  if (input.fromPhoneHash !== undefined && !SHA256_HEX.test(input.fromPhoneHash)) {
    throw new Error('call.from_phone_hash must be a SHA-256 hex digest, not a phone number')
  }
  return firstRow(
    await db.insert(call).values({
      outletId: input.outletId,
      transport: input.transport,
      providerCallSid: input.providerCallSid ?? null,
      fromPhoneHash: input.fromPhoneHash ?? null,
      customerId: input.customerId ?? null,
    }).returning(),
    'call',
  )
}

/**
 * One line of the transcript. `text` is stored as spoken: the review screen needs what the
 * caller actually said (M2 design "Surfaces"). Stripping digits is the prompt's job, not the
 * ledger's (src/voice/prompt.ts `sanitiseCallerText`).
 */
export async function appendTurn(callId: string, input: {
  seq: number
  speaker: CallTurnRow['speaker']
  text: string
  language?: CallTurnRow['language']
  asrConfidence?: number
  startedMs?: number
  endedMs?: number
  toolCalls?: ToolCallRecord[]
}): Promise<CallTurnRow> {
  // `guarded`: a caller can say a phone number or an address, and a failed insert's error would
  // otherwise carry it into the server log (CLAUDE.md: no PII in logs).
  return guarded('call_turn.append', async () => firstRow(
    await db.insert(callTurn).values({
      callId,
      seq: input.seq,
      speaker: input.speaker,
      text: input.text,
      language: input.language ?? null,
      asrConfidence: input.asrConfidence ?? null,
      startedMs: input.startedMs ?? null,
      endedMs: input.endedMs ?? null,
      toolCalls: input.toolCalls ?? [],
    }).returning(),
    'call_turn',
  ))
}

/**
 * Build Spec §5.2 "post-call": outcome, duration and the allowance flag. Compare-and-set on
 * `ended_at`: the outcome feeds Build Spec §12's completion rate and the flag feeds the trial
 * allowance (Ideation §10), so a second end — the browser hanging up after a handoff already
 * closed the session — must not overwrite the first. A second call is a programmer error and
 * throws; the loop checks `session.ended` before calling.
 */
export async function endCall(callId: string, input: {
  outcome: NonNullable<CallRow['outcome']>
  handoffReason?: string
  intent?: CallRow['intent']
  languageDetected?: CallRow['languageDetected']
  orderId?: string
  durationSec: number
  countsTowardAllowance: boolean
}): Promise<CallRow> {
  const [row] = await db
    .update(call)
    .set({
      outcome: input.outcome,
      handoffReason: input.handoffReason ?? null,
      // `intent` is not null with a default; an end that does not know it leaves it as it is.
      ...(input.intent !== undefined ? { intent: input.intent } : {}),
      languageDetected: input.languageDetected ?? null,
      orderId: input.orderId ?? null,
      durationSec: input.durationSec,
      countsTowardAllowance: input.countsTowardAllowance,
      endedAt: new Date(),
    })
    .where(and(eq(call.id, callId), isNull(call.endedAt)))
    .returning()
  if (!row) throw new Error(`Call ${callId} does not exist or has already ended`)
  return row
}

/**
 * The ledger accrues per turn (M2 design "The turn", step 4): one row per call, every add summed
 * into it. `total_paise` is recomputed from every column, so the telephony, STT and TTS columns
 * the Exotel transport fills later count the day they are filled.
 */
export async function addCost(callId: string, input: {
  llmPaise: number
  tokensIn: number
  tokensOut: number
  smsPaise?: number
}): Promise<CallCostRow> {
  const llmPaise = paise(input.llmPaise)
  const smsPaise = paise(input.smsPaise ?? 0)
  return firstRow(
    await db
      .insert(callCost)
      .values({
        callId,
        llmPaise,
        smsPaise,
        tokensIn: input.tokensIn,
        tokensOut: input.tokensOut,
        totalPaise: paise(llmPaise + smsPaise),
      })
      .onConflictDoUpdate({
        target: callCost.callId,
        // In ON CONFLICT ... SET every expression sees the stored row, so the total can read the
        // columns this statement also increments without double-counting.
        set: {
          llmPaise: sql`${callCost.llmPaise} + excluded.llm_paise`,
          smsPaise: sql`${callCost.smsPaise} + excluded.sms_paise`,
          tokensIn: sql`${callCost.tokensIn} + excluded.tokens_in`,
          tokensOut: sql`${callCost.tokensOut} + excluded.tokens_out`,
          totalPaise: sql`${callCost.telephonyPaise} + ${callCost.sttPaise} + ${callCost.ttsPaise}
            + ${callCost.llmPaise} + excluded.llm_paise + ${callCost.smsPaise} + excluded.sms_paise`,
        },
      })
      .returning(),
    'call_cost',
  )
}

/** The review screen's read: the call, its transcript in order, and the ledger row (null until the first `addCost`). */
export async function getCall(callId: string) {
  return (
    (await db.query.call.findFirst({
      where: eq(call.id, callId),
      with: { turns: { orderBy: asc(callTurn.seq) }, cost: true },
    })) ?? null
  )
}

export type CallListRow = CallRow & {
  totalPaise: number
  restaurantName: string
  outletName: string
  /** Caller utterances only — the number the allowance rule counts (M2 design "Cost ledger"). */
  callerTurns: number
}

/** The call list (M2 design "Surfaces"): newest first, with the outlet's name, the caller-turn count and the ledger total. */
export async function listCalls(input: {
  outletId?: string
  outcome?: NonNullable<CallRow['outcome']>
  transport?: CallRow['transport']
  limit: number
  /** Paging cursor: calls started strictly before this instant, i.e. the last row's `startedAt`. */
  before?: Date
}): Promise<CallListRow[]> {
  return db
    .select({
      ...getTableColumns(call),
      // Written out, not `${callCost.totalPaise}`: see `listBatches` in codes.ts.
      totalPaise: sql<number>`coalesce((select cc.total_paise from call_cost cc where cc.call_id = "call".id), 0)::int`,
      restaurantName: restaurant.name,
      outletName: outlet.name,
      callerTurns: sql<number>`(select count(*) from call_turn ct where ct.call_id = "call".id and ct.speaker = 'customer')::int`,
    })
    .from(call)
    .innerJoin(outlet, eq(call.outletId, outlet.id))
    .innerJoin(restaurant, eq(outlet.restaurantId, restaurant.id))
    .where(and(
      input.outletId ? eq(call.outletId, input.outletId) : undefined,
      input.outcome ? eq(call.outcome, input.outcome) : undefined,
      input.transport ? eq(call.transport, input.transport) : undefined,
      input.before ? lt(call.startedAt, input.before) : undefined,
    ))
    .orderBy(desc(call.startedAt), desc(call.id))
    .limit(input.limit)
}

/**
 * /app/today's "AI calls used" (M2 design "Cost ledger"): calls started in [from, to) with
 * `counts_toward_allowance` set, Exotel only.
 *
 * Decision: Ideation §10 defines an AI-handled call as "any inbound call the AI answers that
 * lasts longer than ten seconds" — a telephone call. A browser call is the mic page or the
 * agent console's simulator: a demo, not an inbound call, and not billable. So `transport =
 * 'exotel'` here, and the agent console's call list shows browser calls under their own
 * transport column and filter instead. The flag itself is still set on browser calls (loop.ts,
 * ≥ 2 caller turns) so the metric can be inspected per call before the first Exotel number exists.
 */
export async function countAllowanceCalls(outletId: string, from: Date, to: Date): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(call)
    .where(and(
      eq(call.outletId, outletId),
      eq(call.countsTowardAllowance, true),
      eq(call.transport, 'exotel'),
      gte(call.startedAt, from),
      lt(call.startedAt, to),
    ))
  return row?.n ?? 0
}

export type CallerChoice = {
  id: string
  /** From `customer.name`, which only exists under a consent; null for a phone-only row. */
  firstName: string | null
  /** The last four digits and nothing more: the number itself never leaves the repo. */
  phoneTail: string
  phoneHash: string
  preferredLanguage: CallRow['languageDetected']
}

/**
 * The simulator's caller picker (M2 design "Surfaces": "seeded customers appear as choices").
 * Lives here rather than customers.ts because it is the call console's read and its projection
 * is shaped for it: the hash the loop identifies the caller by, a first name and a masked tail
 * to pick them by — the full number stays on `customer` (CLAUDE.md).
 *
 * ponytail: every customer, oldest first, capped at 50. A pilot has a handful; the upgrade is a
 * search box over the name when a restaurant has more customers than fit in a <select>.
 */
export async function listCallers(): Promise<CallerChoice[]> {
  const rows = await db
    .select({ id: customer.id, name: customer.name, phone: customer.phone, phoneHash: customer.phoneHash, preferredLanguage: customer.preferredLanguage })
    .from(customer)
    .orderBy(asc(customer.createdAt), asc(customer.id))
    .limit(50)
  return rows.map((r) => ({
    id: r.id,
    firstName: r.name?.trim().split(/\s+/)[0] ?? null,
    phoneTail: r.phone.slice(-4),
    phoneHash: r.phoneHash,
    preferredLanguage: r.preferredLanguage,
  }))
}

/** The review screen's one write (M2 design "Surfaces"): a tag for M4's tuning loop (Build Spec §8). */
export async function tagCall(callId: string, tag: NonNullable<CallRow['tag']>, actor: Actor): Promise<CallRow> {
  return db.transaction(async (tx) => {
    const before = await tx.query.call.findFirst({ where: eq(call.id, callId) })
    if (!before) throw new Error(`No call ${callId}`)
    const after = firstRow(
      await tx.update(call).set({ tag }).where(eq(call.id, callId)).returning(),
      `call ${callId}`,
    )
    await writeAudit({
      actorType: actor.type,
      actorId: actor.id,
      action: 'call.tag',
      entity: 'call',
      entityId: callId,
      before: { tag: before.tag },
      after: { tag: after.tag },
    }, tx)
    return after
  })
}
