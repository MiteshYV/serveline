import { randomBytes } from 'node:crypto'
import { and, asc, count, desc, eq, getTableColumns, sql } from 'drizzle-orm'
import { db } from '../client.ts'
import { cardBatch, codeRedemption, discountCode } from '../schema/index.ts'
import { type Actor, firstRow, writeAudit } from './ops.ts'

/**
 * Win-back: card batches, discount codes, redemptions. Build Spec §4 "Win-back", §6, §7.
 *
 * The rule the card promises — one win-back redemption per phone per restaurant (Ideation §8
 * flow 5) — is held twice: as a value by src/core/codes.ts, so the customer can be told, and as
 * two unique indexes on `code_redemption`, so it still holds when two taps arrive at once.
 * `countPriorRedemptions` feeds the first; `recordRedemption` translates the second.
 */

type CodeRow = typeof discountCode.$inferSelect
type RedemptionRow = typeof codeRedemption.$inferSelect

/** What the redemption rules and the indexes read off a code. */
type CodeRef = Pick<CodeRow, 'id' | 'restaurantId' | 'kind'>

/**
 * Case-insensitive on the customer's side: a code is read off a card and typed on a phone.
 * Stored codes are upper case — `createBatch` makes them so, and anything creating a `manual`
 * code must do the same, because the unique index compares exact text.
 */
export async function getCodeByText(restaurantId: string, code: string): Promise<CodeRow | null> {
  return (
    (await db.query.discountCode.findFirst({
      where: and(
        eq(discountCode.restaurantId, restaurantId),
        eq(discountCode.code, code.trim().toUpperCase()),
      ),
    })) ?? null
  )
}

/**
 * The number core's `RedemptionContext.priorRedemptions` wants, per its doc comment: for a
 * `win_back_card`, this customer's win-back redemptions at this restaurant across every code
 * and batch — a second batch must not reset the count; for `manual`, redemptions of this
 * specific code. Each matches one of the two unique indexes on `code_redemption`.
 */
export async function countPriorRedemptions(code: CodeRef, customerId: string): Promise<number> {
  const scope = code.kind === 'win_back_card'
    ? and(
        eq(codeRedemption.restaurantId, code.restaurantId),
        eq(codeRedemption.kind, 'win_back_card'),
        eq(codeRedemption.customerId, customerId),
      )
    : and(eq(codeRedemption.codeId, code.id), eq(codeRedemption.customerId, customerId))

  const [row] = await db.select({ n: count() }).from(codeRedemption).where(scope)
  return row?.n ?? 0
}

export type RecordRedemptionResult =
  | { ok: true; redemption: RedemptionRow }
  | { ok: false; reason: 'already_redeemed' }

/**
 * Records the redemption, and lets the indexes have the last word. `restaurant_id` and `kind`
 * are copied from the code so the partial per-restaurant index can see them (see the schema).
 *
 * A unique violation from either index is the "already redeemed" answer, returned as a value
 * — the same token core's `canRedeem` uses, so the ordering page shows one message whichever
 * half of the rule caught it. It is never a 500 (Build Spec §6: "A second attempt shows the
 * menu without the discount and says so").
 *
 * ponytail: this runs after `createOrder`, in its own statement, because `order_id` is a
 * not-null foreign key. The lost race — two checkouts both passing `canRedeem`, the second
 * refused here — leaves that second order carrying a discount with no redemption row. The
 * route re-prices or cancels; the upgrade path is threading the order transaction through.
 */
export async function recordRedemption(
  input: { code: CodeRef; customerId: string; orderId: string; channel: RedemptionRow['channel'] },
  actor: Actor,
): Promise<RecordRedemptionResult> {
  try {
    const redemption = await db.transaction(async (tx) => {
      const row = firstRow(
        await tx
          .insert(codeRedemption)
          .values({
            codeId: input.code.id,
            restaurantId: input.code.restaurantId,
            kind: input.code.kind,
            customerId: input.customerId,
            orderId: input.orderId,
            channel: input.channel,
          })
          .returning(),
        'code_redemption',
      )
      await writeAudit({
        actorType: actor.type,
        actorId: actor.id,
        action: 'code.redeem',
        entity: 'code_redemption',
        entityId: row.id,
        before: null,
        after: row,
      }, tx)
      return row
    })
    return { ok: true, redemption }
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, reason: 'already_redeemed' }
    throw error
  }
}

/**
 * SQLSTATE 23505. Drizzle wraps the driver's error in a DrizzleQueryError whose `cause` is the
 * Postgres error; a bare driver error carries `code` itself. Both are checked so the answer
 * does not depend on which layer threw.
 */
function isUniqueViolation(error: unknown): boolean {
  const pg = error instanceof Error && error.cause !== undefined ? error.cause : error
  return typeof pg === 'object' && pg !== null && (pg as { code?: unknown }).code === '23505'
}

/** 32 symbols with no 0/O or 1/I: the code is read off a printed card under kitchen light. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function generateCodes(qty: number): string[] {
  const out = new Set<string>()
  while (out.size < qty) {
    let code = ''
    for (const byte of randomBytes(8)) code += ALPHABET.charAt(byte & 31)
    out.add(code)
  }
  return [...out]
}

/**
 * Build Spec §7 "Cards and codes: generate a batch (quantity, percent, validity)". One
 * `card_batch` and `qty` win-back codes, together or not at all. The PDF is the storage
 * adapter's job afterwards; `pdf_s3_key` stays null until it lands.
 *
 * ponytail: eight random symbols from a 32-letter alphabet is 2^40 per code; a collision
 * inside a restaurant trips `discount_code_restaurant_code_uq` and the batch rolls back.
 * Regenerating is the fix, and it will not be needed before the alphabet is.
 */
export async function createBatch(
  input: {
    restaurantId: string
    outletId: string
    qty: number
    percent: number
    validFrom?: Date
    validTo?: Date
  },
  actor: Actor,
) {
  if (!Number.isInteger(input.qty) || input.qty < 1 || input.qty > 5000) {
    throw new RangeError(`A batch is 1 to 5000 cards, received ${input.qty}`)
  }
  if (!Number.isInteger(input.percent) || input.percent < 1 || input.percent > 100) {
    throw new RangeError(`Discount percent must be a whole number from 1 to 100, received ${input.percent}`)
  }
  void actor // card batches are not customer data (CLAUDE.md); nothing to audit

  const codes = generateCodes(input.qty)
  return db.transaction(async (tx) => {
    const batch = firstRow(
      await tx
        .insert(cardBatch)
        .values({ restaurantId: input.restaurantId, outletId: input.outletId, qty: input.qty })
        .returning(),
      'card_batch',
    )

    const rows = await tx
      .insert(discountCode)
      .values(codes.map((code) => ({
        restaurantId: input.restaurantId,
        code,
        kind: 'win_back_card' as const,
        percent: input.percent,
        batchId: batch.id,
        validFrom: input.validFrom,
        validTo: input.validTo ?? null,
      })))
      .returning()
    return { batch, codes: rows }
  })
}

/** Newest first, with the two numbers the dashboard shows per batch (Build Spec §7). */
export async function listBatches(restaurantId: string) {
  return db
    .select({
      ...getTableColumns(cardBatch),
      // Written out, not `${cardBatch.id}`: in a select-list subquery drizzle renders the
      // column unqualified, which is ambiguous once the subquery has tables of its own.
      codeCount: sql<number>`(select count(*)::int from discount_code dc where dc.batch_id = card_batch.id)`,
      redemptionCount: sql<number>`(
        select count(*)::int from code_redemption cr
        join discount_code dc on dc.id = cr.code_id
        where dc.batch_id = card_batch.id
      )`,
    })
    .from(cardBatch)
    .where(eq(cardBatch.restaurantId, restaurantId))
    .orderBy(desc(cardBatch.createdAt))
}

/** Redemptions across a batch's codes, newest first, with the code text for the row label. */
export async function listRedemptionsForBatch(batchId: string) {
  return db
    .select({ ...getTableColumns(codeRedemption), code: discountCode.code })
    .from(codeRedemption)
    .innerJoin(discountCode, eq(discountCode.id, codeRedemption.codeId))
    .where(eq(discountCode.batchId, batchId))
    .orderBy(desc(codeRedemption.redeemedAt))
}

/** Every code in a batch, in creation order — the print page renders one card per row. */
export async function listCodesForBatch(batchId: string) {
  return db.select().from(discountCode).where(eq(discountCode.batchId, batchId)).orderBy(asc(discountCode.createdAt))
}
