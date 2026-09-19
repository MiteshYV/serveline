import type { CodeOutcome } from '@/checkout/place-order.ts'
import { t, type Lang, type UiKey } from '@/ui/i18n.ts'

const REFUSAL_KEY: Record<(CodeOutcome & { ok: false })['reason'], UiKey> = {
  not_found: 'code.not_found',
  wrong_restaurant: 'code.wrong_restaurant',
  inactive: 'code.inactive',
  not_yet_valid: 'code.not_yet_valid',
  expired: 'code.expired',
  already_redeemed: 'code.already_redeemed',
  limit_reached: 'code.limit_reached',
}

/**
 * The one line the page says about a code — applied, or why not — in the customer's language.
 * Core's `RedemptionRefusal` token maps to copy here, never in core (src/core/codes.ts).
 */
export function codeMessage(outcome: CodeOutcome, lang: Lang): string {
  return outcome.ok
    ? t('code.applied', lang, { percent: outcome.percent, code: outcome.code })
    : t(REFUSAL_KEY[outcome.reason], lang, { code: outcome.code })
}
