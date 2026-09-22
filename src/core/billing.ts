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
  /**
   * The call allowance this estimate was measured against — the trial's own limit while the
   * restaurant is trialing, the plan's 500 afterwards. Returned so /app/today and /app/billing
   * print the number the arithmetic used instead of restating a constant beside it.
   */
  allowance: number
  overageCalls: number
  overagePaise: Paise
  feePaise: Paise
  totalPaise: Paise
}

/**
 * Build Spec §13's month-end arithmetic. `channelValuePaise` is the delivered ServeLine-channel
 * order value for the period (repos/dashboard.ts channelOrderValue). The fee rounds down to the
 * paisa — the restaurant is the one paying, and a fee should never round against the payer.
 *
 * Finding trial-invoice-charges-subscription: Build Spec §13 and Ideation §10 give a new
 * restaurant "30 days from `trial_started_at` or 150 allowance calls, whichever first" free, and
 * this function had no notion of it — every pilot owner's first billing screen quoted ₹4,999 they
 * did not owe, against an allowance of 500 they did not have. The 2% fee is unchanged: §13 puts it
 * on delivered ServeLine-channel orders with no trial exemption.
 *
 * `trialing` means the whole period is inside the trial, which is what `restaurant.status ===
 * 'trialing'` gives a month-to-date estimate. The month in which a trial expires part way through
 * is NOT decided by Ideation §10 or Build Spec §13 — billed in full, pro-rated, or billed from the
 * following month — so it is deliberately not answered here. Ask before implementing it.
 */
export function estimateInvoice(input: {
  aiCalls: number
  channelValuePaise: number
  trialing?: boolean
  /** `restaurant.trial_call_limit`. Ignored unless `trialing`. */
  trialCallLimit?: number
}): InvoiceEstimate {
  const trialing = input.trialing === true
  const allowance = trialing ? (input.trialCallLimit ?? TRIAL_CALL_LIMIT) : CALL_ALLOWANCE
  const subscriptionPaise = trialing ? paise(0) : SUBSCRIPTION_PAISE
  const overageCalls = Math.max(0, input.aiCalls - allowance)
  // Nothing is charged for calls during the trial. §13 answers the trial limit with a conversion
  // screen, not a bill, and prices overage "at ₹5 per call beyond 500" under the paid plan; the
  // count is still returned so a screen can show how much of the allowance is gone.
  const overagePaise = paise(trialing ? 0 : overageCalls * OVERAGE_PER_CALL_PAISE)
  const feePaise = paise(Math.floor((input.channelValuePaise * FEE_PERCENT) / 100))
  return {
    subscriptionPaise,
    allowance,
    overageCalls,
    overagePaise,
    feePaise,
    totalPaise: paise(subscriptionPaise + overagePaise + feePaise),
  }
}
