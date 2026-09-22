import { vendorMode } from '../mode.ts'
import { mockPaymentsAdapter } from './mock.ts'
import { razorpayPayments } from './razorpay.ts'

/**
 * Payments. Build Spec §9 "Razorpay": one Payment Link per order, UPI intent enabled, 30-minute
 * expiry, webhooks `payment_link.paid` and `payment.captured` verified and idempotent.
 *
 * The interface is the real one; only the implementation is mocked at M1 (M1 design, acceptance
 * criterion 2). Money is paise (CLAUDE.md), which happens to be Razorpay's own unit.
 */
export type PaymentsAdapter = {
  createLink(input: {
    orderId: string
    amountPaise: number
    restaurantId: string
    description: string
  }): Promise<{ linkId: string; url: string; expiresAt: Date }>

  /**
   * Close a link at the gateway, so it can never be paid. Build Spec §9 gives a link 30 minutes;
   * this is for the links that stop being the truth before that — superseded by a resend,
   * converted to cash on delivery, or hanging off an order that has reached a terminal state.
   * Marking our own `payment` row `unpaid` does not stop a capture; only this does.
   *
   * Throws when the gateway refuses (an unknown link, or one it has already captured). Callers
   * close links through `closeLinks` below, which tolerates that.
   */
  cancelLink(linkId: string): Promise<void>

  /** `signature` is the `X-Razorpay-Signature` header: hex HMAC-SHA256 of the raw body. */
  verifyWebhook(rawBody: string, signature: string): boolean

  /** Call only after `verifyWebhook` returned true. Throws on a body that is not a Razorpay event. */
  parseWebhook(rawBody: string): {
    event: 'payment_link.paid' | 'payment.captured' | 'other'
    linkId: string
    paymentId: string
    amountPaise: number
  }
}

export function payments(): PaymentsAdapter {
  return vendorMode() === 'mock' ? mockPaymentsAdapter : razorpayPayments()
}

/**
 * Closes links that have stopped being how an order gets paid (bug hunt:
 * superseded-payment-link-still-payable, cod-conversion-leaves-upi-link-payable). The database
 * half — the `payment` rows — is the repository's; this is the half that stops the gateway
 * taking the money a second time.
 *
 * Tolerant by design: a link the gateway has already captured, or never heard of, cannot be
 * cancelled, and that must not fail the resend, the COD conversion or the cancellation that
 * closed it. Logged by link id, which is not customer data (CLAUDE.md).
 */
export async function closeLinks(linkIds: readonly string[]): Promise<void> {
  for (const linkId of linkIds) {
    try {
      await payments().cancelLink(linkId)
    } catch (error) {
      console.warn(`[payments] link ${linkId} was not cancelled:`, error instanceof Error ? error.message : error)
    }
  }
}
