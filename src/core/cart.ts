/**
 * Cart construction and pricing. Pure: no database, no framework, no request.
 *
 * This module is the reason `src/core` exists. At M2 the voice service's `add_to_cart` tool
 * (Build Spec §5.5) reaches `POST /api/v1/voice/tools/add_to_cart`, and that route calls the same
 * `priceCart` the ordering page calls. One implementation means the AI cannot quote a price the
 * web page would not honour. Any pricing or validation rule that gets written into a route handler
 * instead of into this file is a rule the two channels are free to disagree about.
 *
 * The types here are plain data on purpose — core does not import the database, so a Drizzle row
 * is mapped into `PricedMenuItem` by whoever loaded it.
 */

import { applyPercentDiscount, paise, type Paise } from './money.ts'

export type CartItemInput = {
  itemId: string
  variantId?: string
  optionIds: string[]
  qty: number
}

export type PricedVariant = {
  id: string
  name: string
  priceDeltaPaise: Paise
}

export type PricedOption = {
  id: string
  name: string
  priceDeltaPaise: Paise
}

export type PricedOptionGroup = {
  id: string
  name: string
  /** Build Spec §4 `item_option_group`. A group with `minSelect` 1 is a required choice. */
  minSelect: number
  maxSelect: number
  options: PricedOption[]
}

/** One `menu_item` with the rows that price it: its variants and its option groups. */
export type PricedMenuItem = {
  id: string
  name: string
  pricePaise: Paise
  variants: PricedVariant[]
  optionGroups: PricedOptionGroup[]
}

export type CartLine = {
  id: string
  /**
   * Names are snapshots, matching `order_item.name_snapshot` (Build Spec §4): a menu republished
   * between the order and the kitchen ticket must not rewrite what the customer agreed to.
   */
  itemName: string
  variantName: string | null
  optionNames: string[]
  qty: number
  unitPricePaise: Paise
  linePaise: Paise
}

export type Cart = {
  lines: CartLine[]
  subtotalPaise: Paise
  discountPaise: Paise
  totalPaise: Paise
}

export type CartErrorCode =
  | 'unknown_item'
  | 'unknown_variant'
  | 'unknown_option'
  | 'duplicate_option'
  | 'min_select'
  | 'max_select'
  | 'invalid_qty'
  /**
   * The menu row prices this line below zero (a variant or option delta larger than the base
   * price). Finding negative-unit-price-cart: a negative line is a negative order total, which
   * means a negative bill on the kitchen ticket, no UPI link, and a *reduction* of the 2% fee in
   * Build Spec §13. Refused here so no channel can carry it.
   */
  | 'invalid_price'

/**
 * One class, one code union — not a hierarchy. `code` is the machine-readable half: the voice
 * service maps it to a spoken apology and the ordering page to an on-screen message, in the
 * customer's language, neither of which can be built from an English sentence. `message` is for
 * the developer reading a log.
 */
export class CartError extends Error {
  readonly code: CartErrorCode

  constructor(code: CartErrorCode, message: string) {
    super(message)
    this.name = 'CartError'
    this.code = code
  }
}

/**
 * Price a whole cart. Throws `CartError` on the first invalid line; it never drops one.
 *
 * `discount` is the already-validated win-back or manual code (Build Spec §4 `discount_code`).
 * Whether the customer is *allowed* that code — one redemption per phone per restaurant — is
 * `src/core/codes`, not here.
 */
export function priceCart(
  inputs: CartItemInput[],
  menu: PricedMenuItem[],
  discount?: { percent: number },
): Cart {
  const byId = new Map(menu.map((item) => [item.id, item]))
  const lines = inputs.map((input, index) => priceLine(input, byId, index))

  const subtotalPaise = paise(lines.reduce((sum, line) => sum + line.linePaise, 0))
  const totalPaise = discount
    ? applyPercentDiscount(subtotalPaise, discount.percent)
    : subtotalPaise

  // Derived rather than computed separately, so `discount + total === subtotal` cannot drift
  // from however `applyPercentDiscount` chooses to round.
  return { lines, subtotalPaise, discountPaise: paise(subtotalPaise - totalPaise), totalPaise }
}

/**
 * The lines of `inputs` that `priceCart` will still accept against today's `menu`, in order.
 *
 * Finding unpriceable-cart-line-kills-cart: a cart saved in a browser outlives the menu it was
 * built from, and checking only that its ids still resolve is not enough — an ordinary dashboard
 * edit (a group made required, a maximum lowered, a base price dropped below a delta) leaves a
 * line whose ids are all real and which `priceCart` nevertheless refuses. One such line threw for
 * the whole cart, and both customer surfaces swallowed that into "your cart is empty" while the
 * cart stayed in storage. "Can this line still be priced" has exactly one answer, and it is this.
 */
export function priceableLines(inputs: CartItemInput[], menu: PricedMenuItem[]): CartItemInput[] {
  return inputs.filter((input) => {
    try {
      priceCart([input], menu)
      return true
    } catch (error) {
      if (error instanceof CartError) return false
      throw error
    }
  })
}

function priceLine(
  input: CartItemInput,
  byId: Map<string, PricedMenuItem>,
  index: number,
): CartLine {
  if (!Number.isInteger(input.qty) || input.qty < 1) {
    throw new CartError(
      'invalid_qty',
      `Quantity must be a whole number of at least 1, received ${input.qty}`,
    )
  }

  const item = byId.get(input.itemId)
  // Build Spec §5.3 menu grounding: every cart mutation must reference a real menu id, and the
  // API rejects anything else. This is the one place that holds for both channels, so an unknown
  // id is refused rather than dropped — a silently missing line is how an AI reads back an order
  // the kitchen was never told to cook.
  if (!item) {
    throw new CartError('unknown_item', `No menu item ${input.itemId}`)
  }

  let unitPrice: number = item.pricePaise
  let variantName: string | null = null

  if (input.variantId !== undefined) {
    const variant = item.variants.find((v) => v.id === input.variantId)
    if (!variant) {
      throw new CartError('unknown_variant', `${item.name} has no variant ${input.variantId}`)
    }
    unitPrice += variant.priceDeltaPaise
    variantName = variant.name
  }

  // Flattened once per line: an option id has to resolve to its group as well as to itself, and
  // an id that resolves to nothing is either invented or belongs to a different item. Those are
  // the same defect from the cart's point of view.
  const optionIndex = new Map(
    item.optionGroups.flatMap((group) =>
      group.options.map((option) => [option.id, { group, option }] as const),
    ),
  )

  const optionNames: string[] = []
  const chosenPerGroup = new Map<string, number>()
  const seen = new Set<string>()

  for (const optionId of input.optionIds) {
    // An option is a tick box, so the same id twice is a malformed request, not two portions.
    // Deduplicating silently would charge once for what a caller believes it asked for twice,
    // and would let a repeat slip under `maxSelect`; both are worse than refusing.
    if (seen.has(optionId)) {
      throw new CartError('duplicate_option', `${optionId} was chosen twice on ${item.name}`)
    }
    seen.add(optionId)

    const hit = optionIndex.get(optionId)
    if (!hit) {
      throw new CartError('unknown_option', `${item.name} has no option ${optionId}`)
    }
    unitPrice += hit.option.priceDeltaPaise
    optionNames.push(hit.option.name)
    chosenPerGroup.set(hit.group.id, (chosenPerGroup.get(hit.group.id) ?? 0) + 1)
  }

  for (const group of item.optionGroups) {
    const chosen = chosenPerGroup.get(group.id) ?? 0
    if (chosen < group.minSelect) {
      throw new CartError(
        'min_select',
        `${group.name} on ${item.name} needs at least ${group.minSelect} choice(s), got ${chosen}`,
      )
    }
    if (chosen > group.maxSelect) {
      throw new CartError(
        'max_select',
        `${group.name} on ${item.name} allows at most ${group.maxSelect} choice(s), got ${chosen}`,
      )
    }
  }

  // After both deltas, because either one alone can take the line below zero. `money.ts` blesses a
  // negative *delta* (a half plate), never a negative price: a negative subtotal also makes
  // `applyPercentDiscount` throw a RangeError, which is not a CartError and escapes every caller.
  if (unitPrice < 0) {
    throw new CartError(
      'invalid_price',
      `${item.name} prices below zero (${unitPrice} paise) with the chosen variant and options`,
    )
  }

  return {
    // The input's position. `priceCart` is pure and recomputes the whole cart on every mutation,
    // so a line id only has to be stable within one result — which is all that
    // `remove_from_cart(line_id)` (Build Spec §5.5) and the quantity stepper need.
    id: `line-${index + 1}`,
    itemName: item.name,
    variantName,
    optionNames,
    qty: input.qty,
    unitPricePaise: paise(unitPrice),
    linePaise: paise(unitPrice * input.qty),
  }
}
