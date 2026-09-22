/**
 * The counter dashboard's reads (Build Spec §7), plus the one write the shared contract left out:
 * convert to COD. Board rows carry what the card needs and `listOpenOrders` does not — the
 * customer's phone for the tel: intent (shown to staff on screen, never logged) and the delivery
 * address for the expanded view. `orders.ts` is untouched; its `sortOpenOrders` is reused so the
 * page, the SSE stream and the poll all rank the same way.
 */

import { and, asc, desc, eq, gt, gte, inArray, isNotNull, lt, notInArray, sql } from 'drizzle-orm'
import { istDayStart } from '../../core/calendar.ts'
import { ORDER_TRANSITIONS, isTerminal, type OrderStatus } from '../../core/orders.ts'
import { db } from '../client.ts'
import {
  customer, externalOrderCount, order, orderEvent, orderItem, payment,
} from '../schema/index.ts'
import { sortOpenOrders, supersedeOutstandingPaymentsIn } from './orders.ts'
import { type Actor, firstRow, writeAudit } from './ops.ts'

const TERMINAL = (Object.keys(ORDER_TRANSITIONS) as OrderStatus[]).filter(isTerminal)

const boardWith = {
  items: { with: { variant: { columns: { name: true } } } },
  customer: { columns: { id: true, phone: true, name: true, preferredLanguage: true } },
  address: true,
} as const

export type BoardOrder = Awaited<ReturnType<typeof listBoardOrders>>[number]

/** Every non-terminal order at the outlet, in design §6.3 board order. */
export async function listBoardOrders(outletId: string) {
  const rows = await db.query.order.findMany({
    where: and(eq(order.outletId, outletId), notInArray(order.status, TERMINAL)),
    with: boardWith,
    orderBy: asc(order.placedAt),
  })
  return sortOpenOrders(rows)
}

/** Same change feed as `listOrdersSince`, with the board's relations. Terminal rows included, so the client can move them to Done. */
export async function listBoardOrdersSince(outletId: string, since: Date): Promise<BoardOrder[]> {
  const touched = db.select({ id: orderEvent.orderId }).from(orderEvent).where(gt(orderEvent.at, since))
  return db.query.order.findMany({
    where: and(eq(order.outletId, outletId), inArray(order.id, touched)),
    with: boardWith,
    orderBy: asc(order.placedAt),
  })
}

/** Finished orders placed since `since` — the collapsed Done group (design §7.1). */
export async function listDoneOrdersSince(outletId: string, since: Date): Promise<BoardOrder[]> {
  return db.query.order.findMany({
    where: and(eq(order.outletId, outletId), inArray(order.status, TERMINAL), gte(order.placedAt, since)),
    with: boardWith,
    orderBy: asc(order.placedAt),
  })
}

/** One order with everything the detail page shows: items, timeline, payments, customer, address. */
export async function getBoardOrder(orderId: string) {
  return (
    (await db.query.order.findFirst({
      where: eq(order.id, orderId),
      with: {
        ...boardWith,
        events: { orderBy: asc(orderEvent.at) },
        payments: { orderBy: asc(payment.createdAt) },
      },
    })) ?? null
  )
}

/**
 * Display numbers. Build Spec §4 gives `order` a uuid and no sequence, and a kitchen cannot shout
 * a uuid across a counter, so the number is the order's rank among the outlet's orders on its IST
 * calendar day: #1 is the first order after midnight, and it is stable for the order's life.
 * Only orders from the earliest given day onwards are ranked, so the window stays small.
 *
 * `at time zone 'UTC'` is load-bearing: `placed_at` is a timestamptz, so casting it to a date
 * consults the database session's own timezone, and the +330 minutes then stacks on top of that
 * offset. On a host east or west of UTC the day rolled at the wrong hour and two orders could
 * share a number — a kitchen shouting "#3" for two different bags. Converting to a plain
 * timestamp first makes the IST shift the only one applied.
 */
export async function orderNumbers(
  outletId: string,
  orders: readonly { id: string; placedAt: Date }[],
): Promise<Map<string, number>> {
  if (orders.length === 0) return new Map()
  const earliest = orders.reduce((min, o) => (o.placedAt < min ? o.placedAt : min), orders[0]!.placedAt)
  const ranked = db
    .select({
      id: order.id,
      n: sql<number>`row_number() over (
        partition by ((((${order.placedAt}) at time zone 'UTC') + interval '330 minutes')::date)
        order by ${order.placedAt}, ${order.id}
      )::int`.as('n'),
    })
    .from(order)
    .where(and(eq(order.outletId, outletId), gte(order.placedAt, istDayStart(earliest))))
    .as('ranked')
  const rows = await db.select({ id: ranked.id, n: ranked.n }).from(ranked)
    .where(inArray(ranked.id, orders.map((o) => o.id)))
  return new Map(rows.map((r) => [r.id, r.n]))
}

/**
 * Build Spec §7 "convert to COD": the customer did not pay the UPI link, so the counter takes
 * cash. Flips the method and, in the same transaction, closes the order's outstanding payment
 * rows — cash is now how this order is paid, so no link on it is owed money any more.
 *
 * Returns the closed links' ids: the caller cancels them at the gateway with `closeLinks`
 * (src/adapters/payments/index.ts) as soon as this commits. Without that the diner who taps the
 * payment link still in their inbox is charged a second time, on top of the cash the rider took
 * (bug hunt: cod-conversion-leaves-upi-link-payable). The vendor call is not made here: a repo
 * function must not hold a transaction open across the network.
 *
 * ponytail: two transactions, not one — `transitionIn` is private to orders.ts. If the second
 * fails the order is COD and still awaiting payment, and the same button repeats the move.
 */
export async function convertToCod(orderId: string, actor: Actor) {
  return db.transaction(async (tx) => {
    const before = await tx.query.order.findFirst({ where: eq(order.id, orderId) })
    if (!before) throw new Error(`No order ${orderId}`)
    if (before.paymentStatus === 'paid') throw new Error('Order is already paid; nothing to convert')
    const after = firstRow(
      await tx.update(order).set({ paymentMethod: 'cod', paymentStatus: 'unpaid' })
        // Compare-and-set on the payment status: a webhook that commits between the read above
        // and this write would otherwise be lost, flipping a just-paid order back to unpaid.
        .where(and(eq(order.id, orderId), eq(order.paymentStatus, before.paymentStatus))).returning(),
      `order ${orderId}`,
    )
    const cancelledLinkIds = await supersedeOutstandingPaymentsIn(tx, orderId, actor)
    await writeAudit({
      actorType: actor.type,
      actorId: actor.id,
      action: 'order.payment_method',
      entity: 'order',
      entityId: orderId,
      before: { paymentMethod: before.paymentMethod, paymentStatus: before.paymentStatus },
      after: { paymentMethod: after.paymentMethod, paymentStatus: after.paymentStatus },
    }, tx)
    return { order: after, cancelledLinkIds }
  })
}

// --- counts the board and the nag need ---------------------------------------------------

const countWhere = async (where: ReturnType<typeof and>) =>
  (await db.select({ n: sql<number>`count(*)::int` }).from(order).where(where))[0]?.n ?? 0

/** Orders placed since `since` (the "14 orders today" of the all-done state, design §7.9). */
export const countOrdersSince = (outletId: string, since: Date) =>
  countWhere(and(eq(order.outletId, outletId), gte(order.placedAt, since)))

/** First-run (design §7.9) is "no orders ever". */
export const hasAnyOrders = async (outletId: string) =>
  (await countWhere(eq(order.outletId, outletId))) > 0

/** Design §7.8: the rush test is orders sitting in received or preparing. */
export const rushCount = (outletId: string) =>
  countWhere(and(eq(order.outletId, outletId), inArray(order.status, ['received', 'preparing'])))

// --- /app/today (Build Spec §7, §12, §13) --------------------------------------------------

export type ChannelRow = { channel: BoardOrder['channel']; orders: number; valuePaise: number }

/** Orders placed in [from, to) by channel, cancelled excluded. */
export async function ordersByChannel(outletId: string, from: Date, to: Date): Promise<ChannelRow[]> {
  return db
    .select({
      channel: order.channel,
      orders: sql<number>`count(*)::int`,
      valuePaise: sql<number>`coalesce(sum(${order.totalPaise}), 0)::int`,
    })
    .from(order)
    .where(and(eq(order.outletId, outletId), gte(order.placedAt, from), lt(order.placedAt, to), notInArray(order.status, ['cancelled'])))
    .groupBy(order.channel)
    .orderBy(order.channel)
}

/**
 * Build Spec §12's numerator: orders delivered (or dine-in served — one state, ADR 0002 §6) in
 * the period. Every order in this table came through ServeLine, so all channels count.
 */
export const deliveredCount = (outletId: string, from: Date, to: Date) =>
  countWhere(and(eq(order.outletId, outletId), eq(order.status, 'delivered'), gte(order.deliveredAt, from), lt(order.deliveredAt, to)))

/**
 * Build Spec §13: 2% on ServeLine-channel orders (ai_call, page_table, page_delivery — not
 * staff_manual) that reached delivered in the period.
 */
export async function channelOrderValue(outletId: string, from: Date, to: Date): Promise<number> {
  const [row] = await db
    .select({ v: sql<number>`coalesce(sum(${order.totalPaise}), 0)::int` })
    .from(order)
    .where(and(
      eq(order.outletId, outletId),
      eq(order.status, 'delivered'),
      inArray(order.channel, ['ai_call', 'page_table', 'page_delivery']),
      gte(order.deliveredAt, from),
      lt(order.deliveredAt, to),
    ))
  return row?.v ?? 0
}

/** Build Spec §12's denominator: aggregator counts for weeks starting in [from, to). Dates are IST `YYYY-MM-DD`. */
export async function externalOrdersBetween(outletId: string, fromDate: string, toDate: string): Promise<number> {
  const weeks = await externalWeeksBetween(outletId, fromDate, toDate)
  return weeks.reduce((n, w) => n + w.orders, 0)
}

/**
 * The weeks the owner has actually entered, each with its Monday — not just their sum.
 *
 * Direct Order Share is a ratio, and the two sides of it are counted over different calendars: the
 * numerator is orders delivered on given days, the denominator is whole weeks typed in from the
 * aggregator apps. Summing the weeks throws away the only thing that lets a caller line the two up,
 * and the old /app/today divided a month of direct orders by whichever weeks happened to start
 * inside that month — which on the 3rd of a month is one week against three days, and reads as
 * 100% (docs/reviews/2026-09-22-bug-hunt.md, direct-order-share-divides-month-by-partial-weeks).
 */
export async function externalWeeksBetween(
  outletId: string,
  fromDate: string,
  toDate: string,
): Promise<{ weekStart: string; orders: number }[]> {
  return db
    .select({
      weekStart: externalOrderCount.weekStart,
      orders: sql<number>`(${externalOrderCount.swiggyOrders} + ${externalOrderCount.zomatoOrders} + ${externalOrderCount.otherOrders})::int`,
    })
    .from(externalOrderCount)
    .where(and(eq(externalOrderCount.outletId, outletId), gte(externalOrderCount.weekStart, fromDate), lt(externalOrderCount.weekStart, toDate)))
    .orderBy(externalOrderCount.weekStart)
}

export async function topCustomers(outletId: string, from: Date, to: Date, limit = 5) {
  return db
    .select({
      customerId: order.customerId,
      name: customer.name,
      /** Staff see the number on screen (it is on `customer`, one of the four tables); it is never logged. */
      phone: customer.phone,
      orders: sql<number>`count(*)::int`,
      valuePaise: sql<number>`coalesce(sum(${order.totalPaise}), 0)::int`,
    })
    .from(order)
    .innerJoin(customer, eq(customer.id, order.customerId))
    .where(and(eq(order.outletId, outletId), isNotNull(order.customerId), gte(order.placedAt, from), lt(order.placedAt, to), notInArray(order.status, ['cancelled'])))
    .groupBy(order.customerId, customer.name, customer.phone)
    .orderBy(desc(sql`count(*)`), desc(sql`sum(${order.totalPaise})`))
    .limit(limit)
}

export async function topDishes(outletId: string, from: Date, to: Date, limit = 5) {
  return db
    .select({
      itemId: orderItem.itemId,
      name: sql<string>`min(${orderItem.nameSnapshot})`,
      qty: sql<number>`sum(${orderItem.qty})::int`,
    })
    .from(orderItem)
    .innerJoin(order, eq(order.id, orderItem.orderId))
    .where(and(eq(order.outletId, outletId), gte(order.placedAt, from), lt(order.placedAt, to), notInArray(order.status, ['cancelled'])))
    .groupBy(orderItem.itemId)
    .orderBy(desc(sql`sum(${orderItem.qty})`))
    .limit(limit)
}
