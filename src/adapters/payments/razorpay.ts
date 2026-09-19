import { createHmac, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import type { PaymentsAdapter } from './index.ts'

/**
 * Razorpay's wire format, which is real today, and the Razorpay client, which is not.
 *
 * The two pure functions below are the inbound half of the integration — what a webhook looks
 * like and how it is signed. The mock uses them unchanged with the secret `mock`, so the webhook
 * route exercises the production verification path at M1. The outbound half (creating a link)
 * needs an account and is the stub at the bottom.
 */

/**
 * Header `X-Razorpay-Signature` = hex(HMAC-SHA256(rawBody, webhookSecret)).
 * https://razorpay.com/docs/webhooks/validate-test/
 */
export function razorpaySignature(rawBody: string, secret: string): string {
  return createHmac('sha256', secret).update(rawBody).digest('hex')
}

export function verifyRazorpaySignature(rawBody: string, signature: string, secret: string): boolean {
  const expected = Buffer.from(razorpaySignature(rawBody, secret), 'hex')
  const given = Buffer.from(signature, 'hex')
  return given.length === expected.length && timingSafeEqual(given, expected)
}

/**
 * Field mapping, Razorpay → ours. https://razorpay.com/docs/webhooks/payloads/payment-links/
 *
 *   event                              → event        'payment_link.paid' | 'payment.captured' | other
 *   payload.payment_link.entity.id     → linkId       'plink_…'  (absent on a bare payment.captured)
 *   payload.payment.entity.id          → paymentId    'pay_…'
 *   payload.payment.entity.amount      → amountPaise  Razorpay amounts are already in paise
 *   payload.payment_link.entity.reference_id  = our order id, set at link creation; not returned
 *                                               because the route joins on linkId (payment.link_id)
 *   payload.payment.entity.contact / .email   = the customer's phone and email. NOT parsed, and the
 *                                               route must strip them before storing the payload
 *                                               verbatim in payment.webhook_payload — CLAUDE.md
 *                                               allows a phone number on four tables and that is
 *                                               not one of them.
 *
 * Unknown keys are dropped (zod's default), so the schema is a floor, not a mirror.
 */
const RazorpayEvent = z.object({
  event: z.string(),
  payload: z.object({
    payment_link: z.object({
      entity: z.object({ id: z.string(), amount_paid: z.number().int() }),
    }).optional(),
    payment: z.object({
      entity: z.object({ id: z.string(), amount: z.number().int() }),
    }).optional(),
  }),
})

export function parseRazorpayWebhook(rawBody: string): ReturnType<PaymentsAdapter['parseWebhook']> {
  // Neither the error nor the log may quote the body: it carries the customer's contact details.
  let json: unknown
  try {
    json = JSON.parse(rawBody)
  } catch {
    throw new Error('Razorpay webhook body is not JSON')
  }
  const parsed = RazorpayEvent.safeParse(json)
  if (!parsed.success) throw new Error('Razorpay webhook body is not in the expected event shape')

  const { event, payload } = parsed.data
  return {
    event: event === 'payment_link.paid' || event === 'payment.captured' ? event : 'other',
    linkId: payload.payment_link?.entity.id ?? '',
    paymentId: payload.payment?.entity.id ?? '',
    amountPaise: payload.payment?.entity.amount ?? payload.payment_link?.entity.amount_paid ?? 0,
  }
}

const REQUIRED_ENV = ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET'] as const

/**
 * Stub. No Razorpay account exists (M1 design §"Build mode"), so `VENDOR_MODE=live` fails loudly
 * here rather than quietly falling back to the mock (CLAUDE.md).
 *
 * ponytail: when the account arrives this becomes POST /v1/payment_links with `upi_link: true`,
 * `expire_by` = now + 30 min, `reference_id` = orderId and a `transfers[]` entry to the restaurant's
 * Route linked account (Build Spec §9). verifyWebhook and parseWebhook above are reused as-is with
 * RAZORPAY_WEBHOOK_SECRET.
 */
export function razorpayPayments(): PaymentsAdapter {
  const missing = REQUIRED_ENV.filter((name) => !process.env[name])
  if (missing.length > 0) throw new Error(`not configured: ${missing.join(', ')}`)
  throw new Error('not implemented: the Razorpay client is a stub until an account exists')
}
