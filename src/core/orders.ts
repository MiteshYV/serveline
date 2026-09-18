/**
 * The order state machine. Pure, because the dashboard, the API and the M2 voice service all
 * have to agree on which move is legal, and only one of those three has a web request to hand.
 */

/**
 * Build Spec §4. These values must stay in step with the `order_status` enum in
 * src/db/schema/enums.ts — core does not import the schema (CLAUDE.md, "Where code goes"),
 * so nothing but this comment couples the two lists.
 */
export type OrderStatus =
  | 'received'
  | 'address_pending'
  | 'awaiting_payment'
  | 'confirmed'
  | 'preparing'
  | 'ready'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled'
  | 'needs_attention'

/** Mirrors the `fulfilment` enum in src/db/schema/enums.ts. Same caveat as OrderStatus. */
export type Fulfilment = 'delivery' | 'pickup' | 'dine_in'

/**
 * Build Spec §4's transition table, as data rather than a switch: the dashboard reads it to
 * decide which action an order card offers (Build Spec §7), so it has to be inspectable and
 * not merely callable.
 *
 * `cancelled` and `needs_attention` appear on every non-terminal row — the spec's "any
 * non-terminal -> cancelled" and "any -> needs_attention". The two terminal rows are empty:
 * an order that is delivered or cancelled is finished, which is the only reading of "any"
 * that leaves those states meaning anything.
 */
export const ORDER_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  received: ['address_pending', 'awaiting_payment', 'confirmed', 'cancelled', 'needs_attention'],
  /** Voice orders with a rough address; the customer confirms it from the address link (§6). */
  address_pending: ['confirmed', 'cancelled', 'needs_attention'],
  /** UPI link orders; the gateway webhook is what moves them on (Build Spec §4). */
  awaiting_payment: ['confirmed', 'cancelled', 'needs_attention'],
  confirmed: ['preparing', 'cancelled', 'needs_attention'],
  preparing: ['ready', 'cancelled', 'needs_attention'],
  /** `delivered` straight from `ready` is the pickup and dine-in hand-over; see nextStatuses. */
  ready: ['out_for_delivery', 'delivered', 'cancelled', 'needs_attention'],
  out_for_delivery: ['delivered', 'cancelled', 'needs_attention'],
  delivered: [],
  cancelled: [],
  /**
   * "handoff incomplete; staff completes or cancels" (Build Spec §4). Completing means
   * finishing the order by hand on the dashboard, which lands it at `confirmed`.
   */
  needs_attention: ['confirmed', 'cancelled'],
}

/** Names the refused move in full, fulfilment included, so a log line is enough to diagnose it. */
export class IllegalTransitionError extends Error {
  readonly from: OrderStatus
  readonly to: OrderStatus
  readonly fulfilment: Fulfilment

  constructor(from: OrderStatus, to: OrderStatus, fulfilment: Fulfilment) {
    super(`Illegal order transition: ${from} -> ${to} (${fulfilment})`)
    this.name = 'IllegalTransitionError'
    this.from = from
    this.to = to
    this.fulfilment = fulfilment
  }
}

/**
 * The single source of truth for what an order may do next. Narrower than the table, because
 * the table is fulfilment-blind: `out_for_delivery` is the rider leg and exists only for
 * `delivery`, while a pickup or dine-in order goes `ready -> delivered` when the customer takes
 * the food. The converse also holds — a delivery order must go out with a rider, so
 * `delivered` is not reachable from `ready` for it.
 *
 * Both the dashboard's buttons (Build Spec §7) and the authorisation check below read this, so
 * staff cannot be offered a move the API would refuse, nor the reverse.
 */
export function nextStatuses(from: OrderStatus, fulfilment: Fulfilment): OrderStatus[] {
  const allowed = ORDER_TRANSITIONS[from]
  if (fulfilment !== 'delivery') return allowed.filter((s) => s !== 'out_for_delivery')
  return from === 'ready' ? allowed.filter((s) => s !== 'delivered') : [...allowed]
}

export function canTransition(from: OrderStatus, to: OrderStatus, fulfilment: Fulfilment): boolean {
  return nextStatuses(from, fulfilment).includes(to)
}

/**
 * An illegal transition is a programmer error, not a state a customer can reach, so it fails
 * loudly (M1 design, "Error handling"). Routes validate their input before core sees it.
 */
export function assertTransition(from: OrderStatus, to: OrderStatus, fulfilment: Fulfilment): void {
  if (!canTransition(from, to, fulfilment)) throw new IllegalTransitionError(from, to, fulfilment)
}

/** `delivered` and `cancelled`, derived from the table so the two cannot drift apart. */
export function isTerminal(status: OrderStatus): boolean {
  return ORDER_TRANSITIONS[status].length === 0
}

/** Only a cancellation needs one; `order.cancelled_reason` is where it goes (Build Spec §4). */
export function requiresReason(to: OrderStatus): boolean {
  return to === 'cancelled'
}
