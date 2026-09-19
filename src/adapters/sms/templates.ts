import type { SmsKind, SmsLanguage } from './index.ts'

/**
 * Message texts per kind and language.
 *
 * PLACEHOLDERS. Every transactional SMS in India must match a DLT-registered template character
 * for character (Ideation §"SMS and DLT"; Build Spec §9). Registration is a two-to-four week
 * external dependency, so these texts and the `dltTemplateId`s are stand-ins: when approval lands,
 * the registered wording replaces each `text` and the real id replaces each `dlt_placeholder_*`.
 * The variable names are the contract with callers and should survive that swap.
 *
 * Hindi and Kannada are interim and not native-reviewed, as with contracts/i18n (ADR 0002 §4).
 *
 * Variables by kind (all required):
 *   otp            code
 *   order_confirm  restaurant, items, total, paymentMode   (Build Spec §9: items, total, payment mode)
 *   payment_link   restaurant, total, url
 *   page_link      restaurant, url
 *   address_link   restaurant, url
 *
 * Pass `total` as `Rs 312` rather than formatINR's `₹312.00`: the rupee sign is not in the GSM-7
 * alphabet, so one ₹ turns an otherwise-ASCII English message into UCS-2 and triples its cost.
 *
 * ponytail: the OTP has no WebOTP line (`@host #code` as the last line, design §7.6) because
 * src/auth/otp.ts issues a code knowing only the phone, not the page's host. Adding it is an
 * `origin` variable here and one argument there, once the ordering page's host is settled.
 */
export type SmsTemplate = { dltTemplateId: string; text: string }

export const TEMPLATES: Readonly<Record<SmsKind, Readonly<Record<SmsLanguage, SmsTemplate>>>> = {
  otp: {
    en: { dltTemplateId: 'dlt_placeholder_otp_en', text: '{code} is your ServeLine code. Valid 10 minutes. Do not share it.' },
    hi: { dltTemplateId: 'dlt_placeholder_otp_hi', text: 'आपका ServeLine कोड {code} है। 10 मिनट तक मान्य। किसी से साझा न करें।' },
    kn: { dltTemplateId: 'dlt_placeholder_otp_kn', text: 'ನಿಮ್ಮ ServeLine ಕೋಡ್ {code}. 10 ನಿಮಿಷ ಮಾನ್ಯ. ಯಾರೊಂದಿಗೂ ಹಂಚಿಕೊಳ್ಳಬೇಡಿ.' },
  },
  order_confirm: {
    en: { dltTemplateId: 'dlt_placeholder_order_confirm_en', text: '{restaurant}: order received. {items}. Total {total}, {paymentMode}.' },
    hi: { dltTemplateId: 'dlt_placeholder_order_confirm_hi', text: '{restaurant}: आपका ऑर्डर मिल गया। {items}। कुल {total}, {paymentMode}।' },
    kn: { dltTemplateId: 'dlt_placeholder_order_confirm_kn', text: '{restaurant}: ನಿಮ್ಮ ಆರ್ಡರ್ ಸ್ವೀಕರಿಸಲಾಗಿದೆ. {items}. ಒಟ್ಟು {total}, {paymentMode}.' },
  },
  payment_link: {
    en: { dltTemplateId: 'dlt_placeholder_payment_link_en', text: '{restaurant}: pay {total} for your order by UPI: {url} Link valid 30 minutes.' },
    hi: { dltTemplateId: 'dlt_placeholder_payment_link_hi', text: '{restaurant}: अपने ऑर्डर के {total} UPI से चुकाएँ: {url} लिंक 30 मिनट तक मान्य।' },
    kn: { dltTemplateId: 'dlt_placeholder_payment_link_kn', text: '{restaurant}: ನಿಮ್ಮ ಆರ್ಡರ್‌ಗೆ {total} UPI ಮೂಲಕ ಪಾವತಿಸಿ: {url} ಲಿಂಕ್ 30 ನಿಮಿಷ ಮಾನ್ಯ.' },
  },
  page_link: {
    en: { dltTemplateId: 'dlt_placeholder_page_link_en', text: '{restaurant}: see the menu and order online: {url}' },
    hi: { dltTemplateId: 'dlt_placeholder_page_link_hi', text: '{restaurant}: मेनू देखें और ऑनलाइन ऑर्डर करें: {url}' },
    kn: { dltTemplateId: 'dlt_placeholder_page_link_kn', text: '{restaurant}: ಮೆನು ನೋಡಿ, ಆನ್‌ಲೈನ್ ಆರ್ಡರ್ ಮಾಡಿ: {url}' },
  },
  address_link: {
    en: { dltTemplateId: 'dlt_placeholder_address_link_en', text: '{restaurant}: confirm your delivery address so we can send your order: {url}' },
    hi: { dltTemplateId: 'dlt_placeholder_address_link_hi', text: '{restaurant}: ऑर्डर भेजने के लिए अपना डिलीवरी पता पक्का करें: {url}' },
    kn: { dltTemplateId: 'dlt_placeholder_address_link_kn', text: '{restaurant}: ಆರ್ಡರ್ ಕಳುಹಿಸಲು ನಿಮ್ಮ ಡೆಲಿವರಿ ವಿಳಾಸವನ್ನು ದೃಢೀಕರಿಸಿ: {url}' },
  },
}

/** Fills `{name}` slots. A slot with no value is a bug in the caller and throws before anything is sent. */
export function renderSms(kind: SmsKind, language: SmsLanguage, vars: Record<string, string>): SmsTemplate {
  const template = TEMPLATES[kind][language]
  const text = template.text.replace(/\{(\w+)\}/g, (_, name: string) => {
    const value = vars[name]
    if (value === undefined) throw new Error(`SMS template ${kind}/${language} needs variable "${name}"`)
    return value
  })
  return { dltTemplateId: template.dltTemplateId, text }
}
