import { and, asc, eq, gt, inArray, notInArray } from 'drizzle-orm'
import type { Cart, CartItemInput, CartLine } from '../../core/cart.ts'
import {
  ORDER_TRANSITIONS, assertTransition, isTerminal, requiresReason, type OrderStatus,
} from '../../core/orders.ts'
import { db } from '../client.ts'
import { customerAddress, order, orderEvent, orderItem, payment } from '../schema/index.ts'
import { SYSTEM } from './_actor.ts'
import { type Actor, type Tx, firstRow, writeAudit } from './ops.ts'

/**
 * The order aggregate: `order`, `order_item`, `order_event`, `payment`.
 *
 * Nothing here prices or decides legality. Pricing arrives as a `Cart` from src/core/cart.ts
 * and is copied, never recomputed; legality is core's `assertTransition`. This file's job is
 * atomicity — an order, its items, its first event and its audit row exist together or not
 * at all — and the state-owned columns (`confirmed_at`, `delivered_at`, `cancelled_reason`).
 */

export type OrderRow = typeof order.$inferSelect
type PaymentRow = typeof payment.$inferSelect

/** Derived from core's table so the two lists cannot drift. */
const TERMINAL = (Object.keys(ORDER_TRANSITIONS) as OrderStatus[]).filter(isTerminal)

export type CreateOrderInput = {
  restaurantId: string
  outletId: string
  channel: OrderRow['channel']
  fulfilment: OrderRow['fulfilment']
  tableNo?: string
  customerId?: string
  addressId?: string
  paymentMethod: OrderRow['paymentMethod']
  discountCodeId?: string
  notes?: string
  /** Already priced by core. Copied verbatim into `order` and `order_item`. */
  cart: Cart
  /**
   * The inputs `priceCart` was given, in the same order. A cart line carries the names and
   * the price charged; the input carries the ids `order_item` references. Zipped by index.
   */
  inputs: CartItemInput[]
}

/** "Chicken Biryani — Half + Boondi raita": what the customer saw, frozen (Build Spec §4). */
const snapshotName = (line: CartLine): string =>
  (line.variantName ? `${line.itemName} — ${line.variantName}` : line.itemName)
  + (line.optionNames.length > 0 ? ` + ${line.optionNames.join(', ')}` : '')

export async function createOrder(input: CreateOrderInput, actor: Actor): Promise<OrderRow> {
  const { cart, inputs } = input
  if (cart.lines.length === 0) throw new Error('Refusing to create an order with no lines')
  if (cart.lines.length !== inputs.length) {
    throw new Error(`Cart has ${cart.lines.length} lines but ${inputs.length} inputs; they must be the same list`)
  }

  return db.transaction(async (tx) => {
    const row = firstRow(
      await tx
        .insert(order)
        .values({
          restaurantId: input.restaurantId,
          outletId: input.outletId,
          customerId: input.customerId ?? null,
          channel: input.channel,
          fulfilment: input.fulfilment,
          tableNo: input.tableNo ?? null,
          status: 'received',
          subtotalPaise: cart.subtotalPaise,
          discountPaise: cart.discountPaise,
          discountCodeId: input.discountCodeId ?? null,
          totalPaise: cart.totalPaise,
          paymentMethod: input.paymentMethod,
          paymentStatus: 'unpaid',
          addressId: input.addressId ?? null,
          // ponytail: at M1 a delivery address only ever arrives typed by the customer on the
          // page, so it is confirmed by construction. M2's voice_rough addresses land as
          // `pending` and the address link confirms them (Build Spec §6).
          addressStatus: input.fulfilment !== 'delivery' ? 'na' : input.addressId ? 'confirmed' : 'pending',
          notes: input.notes ?? null,
        })
        .returning(),
      'order',
    )

    const items = cart.lines.map((line, i) => {
      const src = inputs[i]
      if (!src) throw new Error(`No input for cart line ${i}`)
      return {
        orderId: row.id,
        itemId: src.itemId,
        variantId: src.variantId ?? null,
        // priceLine pushes option names in input order, so the two arrays align.
        options: src.optionIds.map((id, j) => ({ id, name: line.optionNames[j] ?? '' })),
        qty: line.qty,
        unitPricePaise: line.unitPricePaise,
        nameSnapshot: snapshotName(line),
      }
    })
    await tx.insert(orderItem).values(items)

    await tx.insert(orderEvent).values({
      orderId: row.id,
      fromStatus: null,
      toStatus: 'received',
      actorType: actor.type,
      actorId: actor.id,
      at: row.placedAt,
    })

    // Build Spec §6 lists saved addresses most recently used first.
    if (input.addressId) {
      await tx.update(customerAddress).set({ lastUsedAt: row.placedAt }).where(eq(customerAddress.id, input.addressId))
    }

    await writeAudit({
      actorType: actor.type,
      actorId: actor.id,
      action: 'order.create',
      entity: 'order',
      entityId: row.id,
      before: null,
      after: row,
    }, tx)
    return row
  })
}

export async function getOrder(orderId: string) {
  return (
    (await db.query.order.findFirst({
      where: eq(order.id, orderId),
      with: { items: true, events: { orderBy: asc(orderEvent.at) }, payments: true },
    })) ?? null
  )
}

/**
 * Design §6.3 sort groups: pinned (address pending) → needs-attention → active, oldest first.
 * Pure and exported so the page, the SSE stream and any client-side merge all rank the same
 * way. Stable sort, so within a group the input order (placed_at ascending) holds.
 */
export function sortOpenOrders<T extends { status: OrderStatus }>(orders: readonly T[]): T[] {
  const rank = (s: OrderStatus) => (s === 'address_pending' ? 0 : s === 'needs_attention' ? 1 : 2)
  return [...orders].sort((a, b) => rank(a.status) - rank(b.status))
}

/** Every non-terminal order at the outlet, in board order. Terminal is core's definition. */
export async function listOpenOrders(outletId: string) {
  const rows = await db.query.order.findMany({
    where: and(eq(order.outletId, outletId), notInArray(order.status, TERMINAL)),
    with: { items: true },
    orderBy: asc(order.placedAt),
  })
  return sortOpenOrders(rows)
}

/**
 * Orders at the outlet with any state change after `since` — creation included, because the
 * first event is the creation. This is the SSE stream's and the 5-second poll's change feed
 * (Build Spec §7). ponytail: a change that writes no `order_event` (mark corrected, a payment
 * landing on an already-confirmed order) is invisible here; the board's full reload catches it.
 */
export async function listOrdersSince(outletId: string, since: Date) {
  const touched = db.select({ id: orderEvent.orderId }).from(orderEvent).where(gt(orderEvent.at, since))
  return db.query.order.findMany({
    where: and(eq(order.outletId, outletId), inArray(order.id, touched)),
    with: { items: true },
    orderBy: asc(order.placedAt),
  })
}

/**
 * The one move an order makes. Core says whether it is legal for this fulfilment; this writes
 * the status, the timestamp that status owns, the `order_event` and the audit row, together.
 */
export async function transitionOrder(
  orderId: string,
  to: OrderStatus,
  actor: Actor,
  reason?: string,
): Promise<OrderRow> {
  return db.transaction(async (tx) => {
    const current = await tx.query.order.findFirst({ where: eq(order.id, orderId) })
    if (!current) throw new Error(`No order ${orderId}`)
    return transitionIn(tx, current, to, actor, reason)
  })
}

/** The transition proper, on a caller's transaction: `attachPayment` and `markPaid` share it. */
async function transitionIn(
  tx: Tx,
  current: OrderRow,
  to: OrderStatus,
  actor: Actor,
  reason?: string,
): Promise<OrderRow> {
  assertTransition(current.status, to, current.fulfilment)
  if (requiresReason(to) && !reason?.trim()) {
    throw new Error(`Transition to ${to} requires a reason (Build Spec §4)`)
  }

  const now = new Date()
  const [row] = await tx
    .update(order)
    .set({
      status: to,
      ...(to === 'confirmed' ? { confirmedAt: now } : {}),
      ...(to === 'delivered' ? { deliveredAt: now } : {}),
      ...(to === 'cancelled' ? { cancelledReason: reason } : {}),
    })
    // Compare-and-set: two staff phones tapping the same card at once both read `received`;
    // only the first write matches, and the second learns the order has moved on.
    .where(and(eq(order.id, current.id), eq(order.status, current.status)))
    .returning()
  if (!row) throw new Error(`Order ${current.id} left ${current.status} while this transition was in flight`)

  await tx.insert(orderEvent).values({
    orderId: row.id,
    fromStatus: current.status,
    toStatus: to,
    actorType: actor.type,
    actorId: actor.id,
    at: now,
  })

  await writeAudit({
    actorType: actor.type,
    actorId: actor.id,
    action: `order.${to}`,
    entity: 'order',
    entityId: row.id,
    before: { status: current.status },
    after: { status: row.status, cancelledReason: row.cancelledReason },
  }, tx)
  return row
}

/**
 * The address link (Build Spec §6): the customer has confirmed where an `address_pending` order
 * goes. Points the order at the confirmed `customer_address` row and, when the order is still
 * `address_pending`, moves it to `confirmed`. The spec's "or awaiting_payment if a link is
 * pending" is not a legal move in core's table (address_pending → awaiting_payment), so the
 * order goes to `confirmed` with `payment_status` still `awaiting`; the webhook then records the
 * payment against a confirmed order, which `markPaid` already handles.
 */
export async function confirmAddress(orderId: string, addressId: string, actor: Actor): Promise<OrderRow> {
  return db.transaction(async (tx) => {
    const current = await tx.query.order.findFirst({ where: eq(order.id, orderId) })
    if (!current) throw new Error(`No order ${orderId}`)

    let row = firstRow(
      await tx.update(order)
        .set({ addressId, addressStatus: 'confirmed' })
        .where(eq(order.id, orderId))
        .returning(),
      `order ${orderId}`,
    )
    await tx.update(customerAddress).set({ lastUsedAt: new Date() }).where(eq(customerAddress.id, addressId))
    await writeAudit({
      actorType: actor.type,
      actorId: actor.id,
      action: 'order.address',
      entity: 'order',
      entityId: row.id,
      before: { addressId: current.addressId, addressStatus: current.addressStatus },
      after: { addressId, addressStatus: 'confirmed' },
    }, tx)
    if (row.status === 'address_pending') row = await transitionIn(tx, row, 'confirmed', actor)
    return row
  })
}

/** Build Spec §7 "mark corrected": the numerator of the error-rate guardrail (Ideation §9). */
export async function markCorrected(orderId: string, actor: Actor): Promise<OrderRow> {
  if (actor.type !== 'staff' || !actor.id) {
    throw new Error('Only a staff user marks an order corrected: corrected_by references staff_user')
  }
  const staffId = actor.id
  return db.transaction(async (tx) => {
    const row = firstRow(
      await tx
        .update(order)
        .set({ correctionFlag: true, correctedAt: new Date(), correctedBy: staffId })
        .where(eq(order.id, orderId))
        .returning(),
      `order ${orderId}`,
    )
    await writeAudit({
      actorType: actor.type,
      actorId: actor.id,
      action: 'order.correct',
      entity: 'order',
      entityId: row.id,
      before: { correctionFlag: false },
      after: { correctionFlag: true, correctedAt: row.correctedAt, correctedBy: row.correctedBy },
    }, tx)
    return row
  })
}

/**
 * A payment link now exists for this order. Records the `payment`, flags the order as
 * awaiting, and — if the order is still `received` — moves it to `awaiting_payment`, the
 * UPI-link branch of Build Spec §4. An order already past `received` (a resent link, Build
 * Spec §7) keeps its status and gains another payment row — and the link it replaces is
 * closed, so a customer holding both SMSes has one live link, not two.
 */
export async function attachPayment(
  input: { orderId: string; gateway: string; linkId: string; amountPaise: number },
  actor: Actor,
): Promise<PaymentRow> {
  return db.transaction(async (tx) => {
    const current = await tx.query.order.findFirst({ where: eq(order.id, input.orderId) })
    if (!current) throw new Error(`No order ${input.orderId}`)

    // The enum has no `expired`; `unpaid` is the nearest — no money moved on this link and none
    // is expected. If the customer pays the old link anyway, `markPaid` still honours it once.
    const superseded = await tx
      .update(payment)
      .set({ status: 'unpaid' })
      .where(and(eq(payment.orderId, input.orderId), eq(payment.status, 'awaiting')))
      .returning({ id: payment.id })

    const row = firstRow(
      await tx
        .insert(payment)
        .values({
          orderId: input.orderId,
          gateway: input.gateway,
          linkId: input.linkId,
          amountPaise: input.amountPaise,
          status: 'awaiting',
        })
        .returning(),
      'payment',
    )

    if (current.status === 'received') await transitionIn(tx, current, 'awaiting_payment', actor)
    await tx.update(order).set({ paymentStatus: 'awaiting' }).where(eq(order.id, current.id))

    await writeAudit({
      actorType: actor.type,
      actorId: actor.id,
      action: 'payment.link',
      entity: 'payment',
      entityId: row.id,
      before: null,
      after: row,
    }, tx)
    for (const old of superseded) {
      await writeAudit({
        actorType: actor.type,
        actorId: actor.id,
        action: 'payment.supersede',
        entity: 'payment',
        entityId: old.id,
        before: { status: 'awaiting' },
        after: { status: 'unpaid', supersededBy: row.id },
      }, tx)
    }
    return row
  })
}

export type MarkPaidResult =
  | { ok: true; orderId: string; alreadyPaid: boolean }
  | { ok: false; reason: 'unknown_link' | 'amount_mismatch' }

/**
 * The gateway webhook. Build Spec §9: "verified and idempotent" — verification is the
 * adapter's, idempotency is here. A second identical webhook finds the payment already paid
 * and returns without touching anything; it is not an error, because the gateway retries on
 * anything but a 2xx and would otherwise retry forever. A webhook for another link on an
 * order that is already paid gets the same answer.
 *
 * Refusals come back as values for the same reason: a link this database has never seen, or
 * an amount that is not the amount the link was made for, are logged by the route and
 * acknowledged, not thrown. The payload is kept verbatim on the row (Build Spec §4).
 */
export async function markPaid(
  linkId: string,
  paymentId: string,
  amountPaise: number,
  webhookPayload: unknown,
): Promise<MarkPaidResult> {
  return db.transaction(async (tx) => {
    // Locked, so two deliveries of the same webhook serialise on the row rather than both
    // reading `awaiting` and both trying to confirm the order.
    const [pay] = await tx.select().from(payment).where(eq(payment.linkId, linkId)).for('update')
    if (!pay) return { ok: false, reason: 'unknown_link' }
    if (pay.status === 'paid') return { ok: true, orderId: pay.orderId, alreadyPaid: true }

    const current = await tx.query.order.findFirst({ where: eq(order.id, pay.orderId) })
    if (!current) throw new Error(`Payment ${pay.id} references missing order ${pay.orderId}`)
    // The order was paid through another link (a resent one, Build Spec §7 — both SMSes reach
    // the phone). The same no-op as a repeated webhook: nothing is written, the order stays paid
    // once. Whatever the gateway captured on the surplus link is a refund, and a human decision.
    if (current.paymentStatus === 'paid') return { ok: true, orderId: current.id, alreadyPaid: true }
    if (pay.amountPaise !== amountPaise) return { ok: false, reason: 'amount_mismatch' }

    const now = new Date()
    await tx
      .update(payment)
      .set({ status: 'paid', paymentId, paidAt: now, webhookPayload })
      .where(eq(payment.id, pay.id))

    // `awaiting_payment -> confirmed` is the UPI branch; `received -> confirmed` covers a
    // webhook that outran the link being attached. Anything else (already confirmed, or
    // cancelled after the customer paid) keeps its status: the money is recorded and the
    // dashboard shows it, and a refund is a human decision.
    if (current.status === 'received' || current.status === 'awaiting_payment') {
      await transitionIn(tx, current, 'confirmed', SYSTEM)
    }
    await tx.update(order).set({ paymentStatus: 'paid' }).where(eq(order.id, current.id))

    await writeAudit({
      actorType: SYSTEM.type,
      actorId: SYSTEM.id,
      action: 'payment.paid',
      entity: 'payment',
      entityId: pay.id,
      before: { status: pay.status },
      after: { status: 'paid', paymentId, amountPaise },
    }, tx)
    return { ok: true, orderId: current.id, alreadyPaid: false }
  })
}
