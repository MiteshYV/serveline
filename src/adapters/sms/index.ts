import { vendorMode } from '../mode.ts'
import { exotelSms } from './exotel.ts'
import { mockSmsAdapter } from './mock.ts'

/**
 * SMS. Build Spec §9 "SMS": five kinds, all on DLT-registered templates with ServeLine's header,
 * cost logged per message. The kinds match the `sms_kind` enum in src/db/schema/enums.ts.
 */
export type SmsKind = 'otp' | 'order_confirm' | 'payment_link' | 'page_link' | 'address_link'

/** Hindi, English, Kannada — the `language` enum. */
export type SmsLanguage = 'hi' | 'en' | 'kn'

export type SmsAdapter = {
  /**
   * `toPhone` is E.164 from core/phone. `vars` fills the template for `kind`; templates.ts lists
   * what each kind needs, and a missing variable throws (a programmer error, not a customer one).
   * The adapter sends and returns; logging the row to `sms_message` is the caller's job via
   * repos/ops.logSms, with the phone hash, never the number.
   */
  send(input: {
    toPhone: string
    kind: SmsKind
    language: SmsLanguage
    vars: Record<string, string>
  }): Promise<{ providerMessageId: string; costPaise: number }>
}

export function sms(): SmsAdapter {
  return vendorMode() === 'mock' ? mockSmsAdapter : exotelSms()
}
