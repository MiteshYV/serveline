/**
 * Operational writes and THE audit function. Every repository imports `writeAudit` from here;
 * nothing else in the codebase inserts into `audit_log` (CLAUDE.md: every customer-data write
 * goes through a repository function that also writes the audit log).
 */

import { and, eq } from 'drizzle-orm'
import { paise } from '../../core/money.ts'
import { db, type Db } from '../client.ts'
import { auditLog, externalOrderCount, smsKind, smsMessage, smsStatus } from '../schema/index.ts'

// One definition of "who is writing", shared by every repo. Re-exported so `./ops.ts` and the
// barrel both hand it out without a second declaration of the same name.
export type { Actor, ActorType } from './_actor.ts'
import type { Actor, ActorType } from './_actor.ts'

/** The `tx` handed to a `db.transaction(...)` callback. */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
/** `db` or a `tx`: a repo write runs the same either way, so the audit row can share the transaction. */
export type Executor = Db | Tx

export type AuditEntry = {
  actorType: ActorType
  actorId: string | null
  /** `entity.verb` — `menu_item.update`, `consent.withdraw` — so the admin view can group by prefix. */
  action: string
  entity: string
  entityId: string
  /** Null on a create; `after` is null on a delete (Build Spec §10: erasure is a real delete). */
  before?: unknown
  after?: unknown
}

/**
 * Pass the `tx` when the entity write is in a transaction, so a failed write leaves no orphan
 * audit row and a written row is never left unaudited.
 *
 * Never put a phone number or a full address in `before`/`after` (CLAUDE.md: phone numbers live
 * on four tables and this is not one of them). Redact at the call site — see updateOutletSettings.
 */
export async function writeAudit(entry: AuditEntry, exec: Executor = db): Promise<void> {
  await exec.insert(auditLog).values({
    actorType: entry.actorType,
    actorId: entry.actorId,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId,
    before: entry.before ?? null,
    after: entry.after ?? null,
  })
}

/**
 * `.returning()` gives an array, and with noUncheckedIndexedAccess its first element is
 * `T | undefined`. An insert or a keyed update that returns nothing is a bug, so it throws.
 */
export function firstRow<T>(rows: T[], what = 'the statement'): T {
  const row = rows[0]
  if (row === undefined) throw new Error(`No row returned for ${what}`)
  return row
}

// --- sms_message ---------------------------------------------------------------------------

export type SmsKind = (typeof smsKind.enumValues)[number]
export type SmsStatus = (typeof smsStatus.enumValues)[number]

export type LogSmsInput = {
  restaurantId: string
  /** SHA-256 hex from `hashPhone`. The number itself must never reach this table. */
  toPhoneHash: string
  kind: SmsKind
  provider: string
  providerMessageId?: string | null
  status?: SmsStatus
  costPaise?: number
  dltTemplateId?: string | null
  sentAt?: Date | null
}

const SHA256_HEX = /^[0-9a-f]{64}$/

/** Build Spec §9: cost is logged per message. No audit row — this is not customer data. */
export async function logSms(input: LogSmsInput) {
  // The one-line guard for the four-tables rule: an E.164 number is 13 characters, a hash is 64.
  if (!SHA256_HEX.test(input.toPhoneHash)) {
    throw new Error('sms_message.to_phone_hash must be a SHA-256 hex digest, not a phone number')
  }
  return firstRow(
    await db.insert(smsMessage).values({
      restaurantId: input.restaurantId,
      toPhoneHash: input.toPhoneHash,
      kind: input.kind,
      provider: input.provider,
      providerMessageId: input.providerMessageId ?? null,
      status: input.status ?? 'queued',
      costPaise: paise(input.costPaise ?? 0),
      dltTemplateId: input.dltTemplateId ?? null,
      sentAt: input.sentAt ?? null,
    }).returning(),
    'sms_message',
  )
}

// --- external_order_count ------------------------------------------------------------------

/** `weekStart` is a calendar date, `YYYY-MM-DD`, and must be a Monday (Build Spec §4). */
export type ExternalCountInput = {
  outletId: string
  weekStart: string
  swiggyOrders: number
  zomatoOrders: number
  otherOrders?: number
}

const isMonday = (isoDate: string) => new Date(`${isoDate}T00:00:00Z`).getUTCDay() === 1

export async function getExternalCount(outletId: string, weekStart: string) {
  const row = await db.query.externalOrderCount.findFirst({
    where: and(eq(externalOrderCount.outletId, outletId), eq(externalOrderCount.weekStart, weekStart)),
  })
  return row ?? null
}

/**
 * Build Spec §7: the Monday prompt. Keyed on (outlet, week) by the unique index, so re-entering
 * a week corrects it rather than double-counting the North Star denominator (Ideation §9).
 */
export async function upsertExternalCount(input: ExternalCountInput, actor: Actor) {
  const enteredBy = actor.id
  if (!enteredBy) throw new Error('external_order_count needs a staff or platform actor')
  // A Tuesday would make a second row for the same week and silently split the denominator.
  if (!isMonday(input.weekStart)) {
    throw new Error(`external_order_count.week_start must be a Monday, received ${input.weekStart}`)
  }

  const counts = {
    swiggyOrders: input.swiggyOrders,
    zomatoOrders: input.zomatoOrders,
    otherOrders: input.otherOrders ?? 0,
  }

  return db.transaction(async (tx) => {
    const before = await tx.query.externalOrderCount.findFirst({
      where: and(
        eq(externalOrderCount.outletId, input.outletId),
        eq(externalOrderCount.weekStart, input.weekStart),
      ),
    })
    const after = firstRow(
      await tx.insert(externalOrderCount)
        .values({ outletId: input.outletId, weekStart: input.weekStart, ...counts, enteredBy })
        .onConflictDoUpdate({
          target: [externalOrderCount.outletId, externalOrderCount.weekStart],
          set: { ...counts, enteredBy, enteredAt: new Date() },
        })
        .returning(),
      'external_order_count',
    )
    await writeAudit({
      actorType: actor.type,
      actorId: actor.id,
      action: before ? 'external_order_count.update' : 'external_order_count.create',
      entity: 'external_order_count',
      entityId: after.id,
      before: before ?? null,
      after,
    }, tx)
    return after
  })
}
