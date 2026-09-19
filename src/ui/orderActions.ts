import { assertTransition, type Fulfilment, type OrderStatus } from '../core/orders.ts'
import type { UiKey } from './i18n.ts'

export type PrimaryAction = { to: OrderStatus; key: UiKey }

/**
 * Design §6.2: ONE primary action per card — "the state machine determines the single next
 * transition. The operator confirms; they never choose." Core's table lists every legal move;
 * this picks the happy-path one and names it. Legality is still core's: every pick is asserted,
 * so a card can never offer a move the API would refuse.
 *
 * Where the spec is silent:
 *  - `confirmed → preparing` is "Start preparing". The design's examples skip `confirmed`
 *    (received → Accept; preparing → Mark ready), but Build Spec §4 has it, so it needs a verb.
 *  - `awaiting_payment`: the gateway webhook is what normally confirms it. The manual move is
 *    Build Spec §7's "convert to COD", so the button says so, and the dashboard's handler for
 *    `onAction('confirmed')` on an awaiting_payment order must also flip the payment method.
 *  - `needs_attention → confirmed` is "Confirm order": "staff completes or cancels" (§4).
 *  - `address_pending` has no transition here: its primary is "Get address", a tel: intent
 *    (design §7.1), handled in the card.
 */
export function primaryAction(status: OrderStatus, fulfilment: Fulfilment): PrimaryAction | null {
  let pick: PrimaryAction
  switch (status) {
    case 'received':
      pick = { to: 'confirmed', key: 'action.accept' }
      break
    case 'awaiting_payment':
      pick = { to: 'confirmed', key: 'action.confirmCod' }
      break
    case 'needs_attention':
      pick = { to: 'confirmed', key: 'action.confirm' }
      break
    case 'confirmed':
      pick = { to: 'preparing', key: 'action.startPreparing' }
      break
    case 'preparing':
      pick = { to: 'ready', key: 'action.markReady' }
      break
    case 'ready':
      pick =
        fulfilment === 'delivery'
          ? { to: 'out_for_delivery', key: 'action.outForDelivery' }
          : { to: 'delivered', key: fulfilment === 'dine_in' ? 'action.markServed' : 'action.markCollected' }
      break
    case 'out_for_delivery':
      pick = { to: 'delivered', key: 'action.markDelivered' }
      break
    case 'address_pending':
    case 'delivered':
    case 'cancelled':
      return null
  }
  assertTransition(status, pick.to, fulfilment)
  return pick
}
