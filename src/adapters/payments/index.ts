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
