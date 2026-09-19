import { paise, type Paise } from './money.ts'

/**
 * Ideation §10 and Build Spec §13, as constants. CLAUDE.md: do not change the fee, the allowance
 * or the trial rules here without a matching change in the Ideation file. /app/today and
 * /app/billing both read these; nothing else may restate them.
 */
export const SUBSCRIPTION_PAISE = paise(4_999_00)
export const CALL_ALLOWANCE = 500
export const OVERAGE_PER_CALL_PAISE = paise(5_00)
export const FEE_PERCENT = 2
export const TRIAL_DAYS = 30
export const TRIAL_CALL_LIMIT = 150

export type InvoiceEstimate = {
  subscriptionPaise: Paise
  overageCalls: number
  overagePaise: Paise
  feePaise: Paise
  totalPaise: Paise
}

/**
 * Build Spec §13's month-end arithmetic. `channelValuePaise` is the delivered ServeLine-channel
 * order value for the period (repos/dashboard.ts channelOrderValue); `aiCalls` is 0 until M2.
 * The fee rounds down to the paisa — the restaurant is the one paying, and a fee should never
 * round against the payer.
 */
export function estimateInvoice(input: { aiCalls: number; channelValuePaise: number }): InvoiceEstimate {
  const overageCalls = Math.max(0, input.aiCalls - CALL_ALLOWANCE)
  const overagePaise = paise(overageCalls * OVERAGE_PER_CALL_PAISE)
  const feePaise = paise(Math.floor((input.channelValuePaise * FEE_PERCENT) / 100))
  return {
    subscriptionPaise: SUBSCRIPTION_PAISE,
    overageCalls,
    overagePaise,
    feePaise,
    totalPaise: paise(SUBSCRIPTION_PAISE + overagePaise + feePaise),
  }
}
