import { randomUUID } from 'node:crypto'
import { paise } from '../../core/money.ts'
import type { PaymentsAdapter } from './index.ts'
import { parseRazorpayWebhook, razorpaySignature, verifyRazorpaySignature } from './razorpay.ts'

/**
 * The M1 payments mock (M1 design §"Adapters"): generates a link and, on demand, a realistic
 * signed webhook. The signature and the event shape are Razorpay's, so the webhook route runs the
 * same code against this mock as it will against the real gateway.
 */

/** The secret the mock signs with. The real one is RAZORPAY_WEBHOOK_SECRET; see razorpay.ts. */
export const MOCK_WEBHOOK_SECRET = 'mock'

/** Build Spec §9: a Payment Link expires 30 minutes after creation. */
const LINK_TTL_MS = 30 * 60 * 1000

export type MockLink = {
  linkId: string
  orderId: string
  restaurantId: string
  amountPaise: number
  description: string
  url: string
  createdAt: Date
  expiresAt: Date
  status: 'created' | 'paid'
  /** Stable once assigned, so a retried webhook carries the same id and stays idempotent. */
  paymentId?: string
}

// Next.js dev evaluates a module once per route bundle. Keep the one map on globalThis (as
// src/db/client.ts does) so the link created by a server action is the one the /mock/pay page
// and the webhook route see.
const g = globalThis as unknown as { __serveline_mock_links?: Map<string, MockLink> }
const links = (g.__serveline_mock_links ??= new Map<string, MockLink>())

const unix = (d: Date) => Math.floor(d.getTime() / 1000)

export const mockPaymentsAdapter: PaymentsAdapter = {
  async createLink({ orderId, amountPaise, restaurantId, description }) {
    if (paise(amountPaise) <= 0) throw new RangeError('A payment link needs a positive amount')
    const linkId = `plink_mock_${randomUUID().replaceAll('-', '')}`
    const createdAt = new Date()
    const link: MockLink = {
      linkId,
      orderId,
      restaurantId,
      amountPaise,
      description,
      // Relative on purpose: the page lives in this app. A caller putting it in an SMS prefixes
      // the app's origin, as it would for any other link.
      url: `/mock/pay/${linkId}`,
      createdAt,
      expiresAt: new Date(createdAt.getTime() + LINK_TTL_MS),
      status: 'created',
    }
    links.set(linkId, link)
    return { linkId, url: link.url, expiresAt: link.expiresAt }
  },

  verifyWebhook: (rawBody, signature) => verifyRazorpaySignature(rawBody, signature, MOCK_WEBHOOK_SECRET),

  parseWebhook: parseRazorpayWebhook,
}

/** What the /mock/pay page and tests drive. Not part of the adapter interface. */
export const mockPayments = {
  get: (linkId: string): MockLink | undefined => links.get(linkId),

  /**
   * "Pay" the link and return the webhook a gateway would send — the caller POSTs `rawBody` to the
   * webhook route with `signature` in `X-Razorpay-Signature`. Paying twice returns the same event
   * again, which is exactly what a gateway retry looks like.
   */
  markPaid(linkId: string): { rawBody: string; signature: string } {
    const link = links.get(linkId)
    if (!link) throw new Error(`Unknown mock payment link ${linkId}`)
    const now = new Date()
    if (link.status === 'created' && now > link.expiresAt) {
      throw new Error(`Mock payment link ${linkId} expired; a real link cannot be paid after expiry either`)
    }
    link.status = 'paid'
    link.paymentId ??= `pay_mock_${randomUUID().replaceAll('-', '')}`

    // Mirrors Razorpay's payment_link.paid payload — field mapping in razorpay.ts. `contact` and
    // `email` are deliberately absent from `payment.entity`: the real event carries them and the
    // route stores an allow-listed projection of the event, never the raw payload (CLAUDE.md, four tables).
    const event = {
      entity: 'event',
      account_id: 'acc_mock',
      event: 'payment_link.paid',
      contains: ['payment_link', 'payment'],
      payload: {
        payment_link: {
          entity: {
            id: link.linkId,
            entity: 'payment_link',
            amount: link.amountPaise,
            amount_paid: link.amountPaise,
            currency: 'INR',
            description: link.description,
            reference_id: link.orderId,
            notes: { restaurant_id: link.restaurantId },
            short_url: link.url,
            status: 'paid',
            upi_link: true,
            created_at: unix(link.createdAt),
            expire_by: unix(link.expiresAt),
            updated_at: unix(now),
          },
        },
        payment: {
          entity: {
            id: link.paymentId,
            entity: 'payment',
            amount: link.amountPaise,
            currency: 'INR',
            status: 'captured',
            captured: true,
            method: 'upi',
            vpa: 'mock@upi',
            description: link.description,
            created_at: unix(now),
          },
        },
      },
      created_at: unix(now),
    }
    const rawBody = JSON.stringify(event)
    return { rawBody, signature: razorpaySignature(rawBody, MOCK_WEBHOOK_SECRET) }
  },

  clear: () => links.clear(),
}
