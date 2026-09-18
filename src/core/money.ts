/**
 * Build Spec §4: money is an integer number of paise everywhere — in the database, in the core,
 * on the wire. Rupees exist only in what a human reads, which is the last line of this file.
 *
 * India-only through Phase 3 (Ideation §12), so there is no currency to carry around.
 */

/**
 * A count of paise. The brand is what stops a rupee figure, or a price typed into a form, being
 * passed where paise is expected: the only way to obtain one is `paise()`.
 */
export type Paise = number & { readonly __brand: 'Paise' }

/**
 * Money arriving as a float means rupees leaked in from somewhere. That is a programmer error and
 * it throws, because a bug that fails in development is cheaper than one that rounds a bill at 8pm
 * on a Saturday. Negative values are legitimate: `item_variant.price_delta_paise` is negative for
 * a half plate priced below the full one.
 */
export const paise = (n: number): Paise => {
  if (!Number.isSafeInteger(n)) {
    throw new TypeError(`Money must be a whole number of paise, received ${n}`)
  }
  return n as Paise
}

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' })

/** Display only. The ₹, the two decimals and the 1,00,000 grouping all come from en-IN. */
export const formatINR = (p: Paise): string => inr.format(p / 100)

/**
 * The payable amount after a percentage discount — the win-back card's 10% (Ideation §6), or a
 * manual code. `order.discount_paise` is the difference between the subtotal and this result.
 *
 * Rounding is in the customer's favour: the discount is rounded up, so nobody is ever charged more
 * than the percentage printed on the card. It costs the restaurant at most one paise per order,
 * which is invisible; the other direction produces a customer who checks the arithmetic, finds
 * 9.99% off and complains about the exact promise the card was printed to make.
 *
 * `percent` is a whole number from 0 to 100, which is what `discount_code.percent` holds
 * (Build Spec §4).
 */
export const applyPercentDiscount = (subtotal: Paise, percent: number): Paise => {
  if (subtotal < 0) {
    throw new RangeError(`Cannot discount a negative subtotal, received ${subtotal}`)
  }
  if (!Number.isInteger(percent) || percent < 0 || percent > 100) {
    throw new RangeError(`Discount percent must be a whole number from 0 to 100, received ${percent}`)
  }
  // `subtotal * percent` is exact: both are integers and a restaurant bill is nowhere near 2^53.
  return paise(subtotal - Math.ceil((subtotal * percent) / 100))
}
