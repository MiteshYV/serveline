/**
 * Discount code redemption rules. Build Spec §6, Ideation §8 flow 5.
 *
 * Refusal is an ordinary outcome here, not an exception, so it comes back as a value. The
 * ordering page has to tell the customer why the card on their packaging did not work, and at M2
 * the voice service has to say the same thing out loud in the caller's language. Neither can do
 * that with a thrown Error carrying an English sentence, so the reason is a machine-readable
 * token and the copy lives with the surface that renders it.
 */

export type RedemptionRefusal =
  | 'wrong_restaurant'
  | 'inactive'
  | 'not_yet_valid'
  | 'expired'
  | 'already_redeemed'
  | 'limit_reached'

export type RedemptionResult =
  | { ok: true; percent: number }
  | { ok: false; reason: RedemptionRefusal }

/** The `discount_code` fields the rules read. Build Spec §4. */
export type DiscountCodeRules = {
  restaurantId: string
  percent: number
  perCustomerLimit: number
  /** Null at either end means open-ended: a `manual` code need not have a closing date. */
  validFrom: Date | null
  validTo: Date | null
  isActive: boolean
}

export type RedemptionContext = {
  /** The restaurant whose page or call this is — not the one printed on the card. */
  restaurantId: string
  /** Rows already in `code_redemption` for this code and this customer. */
  priorRedemptions: number
  /** Passed in, not read from the clock, so a validity window can be tested without waiting. */
  now: Date
}

export function canRedeem(code: DiscountCodeRules, context: RedemptionContext): RedemptionResult {
  // Ordered so the customer gets the most specific true thing first: a card for another
  // restaurant is a different problem from one that ran out yesterday.
  if (code.restaurantId !== context.restaurantId) return { ok: false, reason: 'wrong_restaurant' }
  if (!code.isActive) return { ok: false, reason: 'inactive' }

  // Both ends inclusive — a code valid to the 31st works on the 31st, which is how the printed
  // card reads to the person holding it.
  if (code.validFrom && context.now < code.validFrom) return { ok: false, reason: 'not_yet_valid' }
  if (code.validTo && context.now > code.validTo) return { ok: false, reason: 'expired' }

  // Ideation §8 flow 5: one redemption per phone per restaurant. The database enforces this as
  // well, with the unique index on `code_redemption (code_id, customer_id)` (Build Spec §4).
  // Both are needed and neither substitutes for the other: this check exists to produce a
  // message the customer can act on, and the index is what still holds when two taps arrive at
  // once and both read zero prior redemptions. A caller that hits the index violation should
  // surface it as this same refusal rather than as a 500.
  if (context.priorRedemptions >= code.perCustomerLimit) {
    // The default limit is 1 and that is the win-back card, so the common refusal deserves the
    // plainer wording: "you have already used this" beats "limit reached".
    return { ok: false, reason: code.perCustomerLimit === 1 ? 'already_redeemed' : 'limit_reached' }
  }

  return { ok: true, percent: code.percent }
}
