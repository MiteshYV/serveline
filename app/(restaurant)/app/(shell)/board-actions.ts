'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { closeLinks, payments } from '@/adapters/payments/index.ts'
import { sms } from '@/adapters/sms/index.ts'
import { phonePepper } from '@/auth/secrets.ts'
import { formatINR, paise } from '@/core/money.ts'
import { IllegalTransitionError, ORDER_TRANSITIONS, isTerminal, type OrderStatus } from '@/core/orders.ts'
import { hashPhone } from '@/core/phone.ts'
import {
  attachPayment, convertToCod, getBoardOrder, logSms, markCorrected, orderNumbers,
  supersedeOutstandingPayments, transitionOrder,
} from '@/db/repos/index.ts'
import { toCardWire, type CardWire } from '@/ui/orderWire.ts'
import { appOrigin } from '../_lib/origin.ts'
import { currentOutlet } from '../_lib/session.ts'

/**
 * Build Spec §7 order actions, as server actions the card and the detail page call. Every
 * result is a value: a server action that throws is masked in production, and the card needs to
 * know it failed so it can revert and offer "Tap to try again" (design §7.10.2).
 */
export type ActionResult = { ok: true; order: CardWire } | { ok: false; error: string }

const STATUSES = Object.keys(ORDER_TRANSITIONS) as [OrderStatus, ...OrderStatus[]]
const Transition = z.object({
  orderId: z.uuid(),
  to: z.enum(STATUSES),
  reason: z.string().trim().max(500).optional(),
})

/** The order, re-read and mapped, after a write. Also checks it belongs to this session's outlet. */
async function reload(orderId: string): Promise<ActionResult> {
  const { outlet } = await currentOutlet()
  const row = await getBoardOrder(orderId)
  if (!row || row.outletId !== outlet.id) return { ok: false, error: 'not_found' }
  const numbers = await orderNumbers(outlet.id, [row])
  revalidatePath('/app')
  revalidatePath(`/app/orders/${orderId}`)
  return { ok: true, order: toCardWire(row, numbers.get(row.id)) }
}

async function ownOrder(orderId: string) {
  const ctx = await currentOutlet()
  const row = await getBoardOrder(orderId)
  if (!row || row.outletId !== ctx.outlet.id) return null
  return { ...ctx, row }
}

export async function transition(input: { orderId: string; to: OrderStatus; reason?: string }): Promise<ActionResult> {
  const parsed = Transition.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'invalid' }
  const { orderId, to, reason } = parsed.data
  const own = await ownOrder(orderId)
  if (!own) return { ok: false, error: 'not_found' }

  try {
    // Build Spec §7 "convert to COD": the primary on an awaiting_payment card is "Confirm as
    // cash on delivery" (orderActions.ts), so confirming from there flips the method first.
    if (to === 'confirmed' && own.row.status === 'awaiting_payment' && own.row.paymentMethod === 'upi_link') {
      await closeLinks((await convertToCod(orderId, own.actor)).cancelledLinkIds)
    }
    await transitionOrder(orderId, to, own.actor, reason)
    // A cancelled or delivered order is not owed money on a link any more, and a link left live
    // on one takes money nobody will refund (bug hunt: resend-payment-link-on-terminal-order).
    if (isTerminal(to)) await closeLinks(await supersedeOutstandingPayments(orderId, own.actor))
  } catch (e) {
    if (e instanceof IllegalTransitionError) return { ok: false, error: 'illegal' }
    // A compare-and-set miss (another phone moved it first) or a missing reason: both are
    // ordinary refusals, and the card re-reads the truth from the stream.
    return { ok: false, error: e instanceof Error ? e.message : 'failed' }
  }
  return reload(orderId)
}

export async function markCorrectedAction(orderId: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(orderId).success) return { ok: false, error: 'invalid' }
  const own = await ownOrder(orderId)
  if (!own) return { ok: false, error: 'not_found' }
  await markCorrected(orderId, own.actor)
  return reload(orderId)
}

export async function convertToCodAction(orderId: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(orderId).success) return { ok: false, error: 'invalid' }
  const own = await ownOrder(orderId)
  if (!own) return { ok: false, error: 'not_found' }
  if (own.row.paymentStatus === 'paid') return { ok: false, error: 'already_paid' }
  // Cash cannot be taken on an order that is over. The card hides the action (orderWire.ts), and
  // a second counter phone whose board has not caught up is why that is not enough.
  if (isTerminal(own.row.status)) return { ok: false, error: 'not_convertible' }
  // Cancelling at the gateway is what stops the diner who taps the payment link still in their
  // inbox being charged on top of the cash (bug hunt: cod-conversion-leaves-upi-link-payable).
  await closeLinks((await convertToCod(orderId, own.actor)).cancelledLinkIds)
  if (own.row.status === 'awaiting_payment') await transitionOrder(orderId, 'confirmed', own.actor)
  return reload(orderId)
}

/**
 * Build Spec §7 "resend payment link": a fresh link (the old one may have expired — 30 minutes,
 * Build Spec §9), attached as a new `payment` row, sent by SMS in the customer's language, and
 * logged by hash. Returns the same shape as the others so the ⋯ menu can treat them alike.
 */
export async function resendPaymentLink(orderId: string): Promise<ActionResult> {
  if (!z.uuid().safeParse(orderId).success) return { ok: false, error: 'invalid' }
  const own = await ownOrder(orderId)
  if (!own) return { ok: false, error: 'not_found' }
  const { row, restaurant, actor } = own
  // `isTerminal` as the card's `canResendLink` has it (orderWire.ts): a cancelled order must not
  // be sent a live "pay for your order" SMS, and the client guard is not the trust boundary
  // (bug hunt: resend-payment-link-on-terminal-order).
  if (row.paymentStatus === 'paid' || row.paymentMethod !== 'upi_link' || isTerminal(row.status)) {
    return { ok: false, error: 'not_linkable' }
  }
  const phone = row.customer?.phone
  if (!phone) return { ok: false, error: 'no_phone' }

  // The link this one replaces stops being payable now, not when it expires half an hour later.
  await closeLinks(await supersedeOutstandingPayments(row.id, actor))

  const link = await payments().createLink({
    orderId: row.id,
    amountPaise: row.totalPaise,
    restaurantId: row.restaurantId,
    description: `${restaurant.name} order`,
  })
  await attachPayment({ orderId: row.id, gateway: 'mock', linkId: link.linkId, amountPaise: row.totalPaise }, actor)

  const origin = await appOrigin()
  const language = row.customer?.preferredLanguage ?? 'en'
  const sent = await sms().send({
    toPhone: phone,
    kind: 'payment_link',
    language,
    vars: {
      restaurant: restaurant.name,
      // "Rs 312", not formatINR's "₹312.00": the rupee sign forces UCS-2 and triples the cost (templates.ts).
      total: `Rs ${formatINR(paise(row.totalPaise)).replace(/[^\d,.]/g, '').replace(/\.00$/, '')}`,
      url: link.url.startsWith('/') ? `${origin}${link.url}` : link.url,
    },
  })
  await logSms({
    restaurantId: row.restaurantId,
    toPhoneHash: hashPhone(phone, phonePepper()),
    kind: 'payment_link',
    provider: 'mock',
    providerMessageId: sent.providerMessageId,
    status: 'sent',
    costPaise: sent.costPaise,
    sentAt: new Date(),
  })
  return reload(orderId)
}
