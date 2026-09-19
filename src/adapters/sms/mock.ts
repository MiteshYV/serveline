import { randomUUID } from 'node:crypto'
import type { SmsAdapter, SmsKind, SmsLanguage } from './index.ts'
import { renderSms } from './templates.ts'

/**
 * The M1 SMS mock: an in-memory inbox the UI can show. M1 design §"Adapters" calls this a better
 * demo artefact than a real message — a walkthrough shows the OTP, the confirmation and the payment
 * link without anyone holding a phone — and it is how OTP works in demo mode.
 */

/**
 * Build Spec §9 asks that cost be logged per message but fixes no figure. Exotel's published
 * transactional rate sits in the ₹0.15–0.25 per segment band (2025–26 list); 20 paise is the
 * midpoint. Replace with the contracted rate when the account exists.
 */
export const COST_PER_SEGMENT_PAISE = 20

/** Newest first, capped here — it is a demo surface, not a log. */
const INBOX_CAP = 200

export type SentSms = {
  /** The fake provider id, what `sms_message.provider_message_id` would hold. */
  id: string
  /**
   * The number, as a real provider's console would show it. This is process memory standing in
   * for the vendor, not a table (CLAUDE.md names the four tables that may hold a phone number) and
   * not a log; it is never written anywhere.
   */
  toPhone: string
  kind: SmsKind
  language: SmsLanguage
  dltTemplateId: string
  text: string
  segments: number
  costPaise: number
  at: Date
}

// One inbox per process across Next.js dev route bundles — same reason as src/db/client.ts.
const g = globalThis as unknown as { __serveline_mock_sms?: SentSms[] }
const inbox = (g.__serveline_mock_sms ??= [])

/**
 * Billing happens per segment: 160 GSM-7 characters (153 each when concatenated), or 70 UCS-2
 * characters (67 concatenated) once a single non-GSM character — any Devanagari or Kannada, or ₹ —
 * is present. Approximating GSM-7 as ASCII is a paise or two out on the rare extended character
 * and exactly right on the case that matters, which is Indic text costing two to three times more.
 */
export function smsSegments(text: string): number {
  const ascii = /^[\x00-\x7F]*$/.test(text)
  const [single, multi] = ascii ? [160, 153] : [70, 67]
  return text.length <= single ? 1 : Math.ceil(text.length / multi)
}

export const mockSmsAdapter: SmsAdapter = {
  async send({ toPhone, kind, language, vars }) {
    const { dltTemplateId, text } = renderSms(kind, language, vars)
    const segments = smsSegments(text)
    const sent: SentSms = {
      id: `mock-sms-${randomUUID()}`,
      toPhone,
      kind,
      language,
      dltTemplateId,
      text,
      segments,
      costPaise: segments * COST_PER_SEGMENT_PAISE,
      at: new Date(),
    }
    inbox.unshift(sent)
    if (inbox.length > INBOX_CAP) inbox.length = INBOX_CAP
    return { providerMessageId: sent.id, costPaise: sent.costPaise }
  },
}

/** The demo inbox. Newest first. */
export const mockInbox = {
  list: (): readonly SentSms[] => [...inbox],
  clear: (): void => {
    inbox.length = 0
  },
}
