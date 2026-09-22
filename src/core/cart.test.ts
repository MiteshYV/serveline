import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { CartError, priceCart, priceableLines, type CartErrorCode, type PricedMenuItem } from './cart.ts'
import { paise } from './money.ts'

// A slice of the seeded Bangalore menu. Prices are paise: ₹120 is 12000.

const dosa: PricedMenuItem = {
  id: 'itm_dosa',
  name: 'Masala Dosa',
  pricePaise: paise(12000),
  variants: [],
  optionGroups: [],
}

const biryani: PricedMenuItem = {
  id: 'itm_biryani',
  name: 'Chicken Biryani',
  pricePaise: paise(24000),
  variants: [
    // A half plate is priced below the full one, so the delta is negative.
    { id: 'var_half', name: 'Half', priceDeltaPaise: paise(-8000) },
    { id: 'var_full', name: 'Full', priceDeltaPaise: paise(0) },
  ],
  optionGroups: [
    {
      id: 'grp_raita',
      name: 'Add raita',
      minSelect: 0,
      maxSelect: 1,
      options: [{ id: 'opt_raita', name: 'Boondi raita', priceDeltaPaise: paise(4000) }],
    },
  ],
}

const thali: PricedMenuItem = {
  id: 'itm_thali',
  name: 'North Indian Thali',
  pricePaise: paise(18000),
  variants: [],
  optionGroups: [
    {
      id: 'grp_bread',
      name: 'Bread',
      minSelect: 1,
      maxSelect: 1,
      options: [
        { id: 'opt_roti', name: 'Roti', priceDeltaPaise: paise(0) },
        { id: 'opt_naan', name: 'Butter naan', priceDeltaPaise: paise(3000) },
      ],
    },
    {
      id: 'grp_extras',
      name: 'Extras',
      minSelect: 0,
      maxSelect: 2,
      options: [
        { id: 'opt_curd', name: 'Curd', priceDeltaPaise: paise(2500) },
        { id: 'opt_papad', name: 'Papad', priceDeltaPaise: paise(1500) },
      ],
    },
  ],
}

const menu = [dosa, biryani, thali]

/** Asserts the call throws a CartError carrying exactly `code`. */
const rejects = (code: CartErrorCode, run: () => unknown) => {
  assert.throws(run, (thrown: unknown) => thrown instanceof CartError && thrown.code === code)
}

describe('priceCart', () => {
  it('prices a plain item', () => {
    const cart = priceCart([{ itemId: 'itm_dosa', optionIds: [], qty: 1 }], menu)

    assert.deepEqual(cart.lines, [{
      id: 'line-1',
      itemName: 'Masala Dosa',
      variantName: null,
      optionNames: [],
      qty: 1,
      unitPricePaise: 12000,
      linePaise: 12000,
    }])
    assert.equal(cart.subtotalPaise, 12000)
    assert.equal(cart.discountPaise, 0)
    assert.equal(cart.totalPaise, 12000)
  })

  it('adds the variant delta to the unit price', () => {
    const cart = priceCart(
      [{ itemId: 'itm_biryani', variantId: 'var_half', optionIds: [], qty: 1 }],
      menu,
    )

    assert.equal(cart.lines[0]?.unitPricePaise, 16000)
    assert.equal(cart.lines[0]?.variantName, 'Half')
    assert.equal(cart.totalPaise, 16000)
  })

  it('adds every selected option, across groups', () => {
    const cart = priceCart(
      [{ itemId: 'itm_thali', optionIds: ['opt_naan', 'opt_curd', 'opt_papad'], qty: 1 }],
      menu,
    )

    // 18000 + 3000 naan + 2500 curd + 1500 papad
    assert.equal(cart.lines[0]?.unitPricePaise, 25000)
    assert.deepEqual(cart.lines[0]?.optionNames, ['Butter naan', 'Curd', 'Papad'])
  })

  it('multiplies the unit price by the quantity', () => {
    const cart = priceCart([{ itemId: 'itm_dosa', optionIds: [], qty: 3 }], menu)

    assert.equal(cart.lines[0]?.unitPricePaise, 12000)
    assert.equal(cart.lines[0]?.linePaise, 36000)
    assert.equal(cart.subtotalPaise, 36000)
  })

  it('applies a percentage discount to the subtotal', () => {
    const cart = priceCart(
      [
        { itemId: 'itm_dosa', optionIds: [], qty: 1 },
        { itemId: 'itm_biryani', variantId: 'var_full', optionIds: [], qty: 1 },
      ],
      menu,
      { percent: 10 },
    )

    assert.equal(cart.subtotalPaise, 36000)
    assert.equal(cart.discountPaise, 3600)
    assert.equal(cart.totalPaise, 32400)
    // The three must always agree, whichever way applyPercentDiscount rounds.
    assert.equal(cart.discountPaise + cart.totalPaise, cart.subtotalPaise)
  })

  it('numbers lines by position so remove_from_cart can name one', () => {
    const cart = priceCart(
      [
        { itemId: 'itm_dosa', optionIds: [], qty: 1 },
        { itemId: 'itm_dosa', optionIds: [], qty: 2 },
      ],
      menu,
    )

    assert.deepEqual(cart.lines.map((line) => line.id), ['line-1', 'line-2'])
  })

  it('returns an empty cart for no inputs', () => {
    const cart = priceCart([], menu)

    assert.deepEqual(cart, {
      lines: [],
      subtotalPaise: 0,
      discountPaise: 0,
      totalPaise: 0,
    })
  })
})

describe('priceCart validation', () => {
  it('refuses an item id that is not on the menu', () => {
    // Build Spec §5.3 menu grounding: refused, not dropped.
    rejects('unknown_item', () => priceCart([{ itemId: 'itm_ghost', optionIds: [], qty: 1 }], menu))
  })

  it('refuses a variant that is not on the item', () => {
    rejects('unknown_variant', () =>
      priceCart([{ itemId: 'itm_biryani', variantId: 'var_family', optionIds: [], qty: 1 }], menu))
  })

  it('refuses an option belonging to a different item', () => {
    // opt_naan is real, but it is the thali's, not the biryani's.
    rejects('unknown_option', () =>
      priceCart([{ itemId: 'itm_biryani', optionIds: ['opt_naan'], qty: 1 }], menu))
  })

  it('refuses the same option twice', () => {
    rejects('duplicate_option', () =>
      priceCart([{ itemId: 'itm_thali', optionIds: ['opt_roti', 'opt_roti'], qty: 1 }], menu))
  })

  it('refuses a group with fewer than min_select choices', () => {
    // Bread is minSelect 1 and nothing was chosen.
    rejects('min_select', () => priceCart([{ itemId: 'itm_thali', optionIds: [], qty: 1 }], menu))
  })

  it('refuses a group with more than max_select choices', () => {
    rejects('max_select', () =>
      priceCart([{ itemId: 'itm_thali', optionIds: ['opt_roti', 'opt_naan'], qty: 1 }], menu))
  })

  it('refuses a quantity of zero', () => {
    rejects('invalid_qty', () => priceCart([{ itemId: 'itm_dosa', optionIds: [], qty: 0 }], menu))
  })

  it('refuses a fractional quantity', () => {
    rejects('invalid_qty', () => priceCart([{ itemId: 'itm_dosa', optionIds: [], qty: 1.5 }], menu))
  })

  // Finding negative-unit-price-cart. The owner drops a base price for a promotion while an old
  // "Half −₹150" variant stays, and the line — and the order total — goes below zero.
  it('refuses a variant delta larger than the base price', () => {
    const underpriced: PricedMenuItem = {
      id: 'itm_promo',
      name: 'Promo Biryani',
      pricePaise: paise(10000),
      variants: [{ id: 'var_half', name: 'Half', priceDeltaPaise: paise(-15000) }],
      optionGroups: [],
    }
    rejects('invalid_price', () =>
      priceCart([{ itemId: 'itm_promo', variantId: 'var_half', optionIds: [], qty: 1 }], [underpriced]))
  })

  it('refuses when the option deltas alone take the line below zero', () => {
    const underpriced: PricedMenuItem = {
      id: 'itm_combo',
      name: 'Light Combo',
      pricePaise: paise(4000),
      variants: [],
      optionGroups: [{
        id: 'grp_drop',
        name: 'Leave out',
        minSelect: 0,
        maxSelect: 2,
        options: [
          { id: 'opt_no_rice', name: 'No rice', priceDeltaPaise: paise(-2500) },
          { id: 'opt_no_curd', name: 'No curd', priceDeltaPaise: paise(-2500) },
        ],
      }],
    }
    rejects('invalid_price', () =>
      priceCart([{ itemId: 'itm_combo', optionIds: ['opt_no_rice', 'opt_no_curd'], qty: 1 }], [underpriced]))
  })

  // The quieter half of the same finding: a negative subtotal made applyPercentDiscount throw a
  // RangeError, which is not a CartError and escaped placeOrder into "Something went wrong".
  it('refuses the negative line before a discount can throw a RangeError', () => {
    const underpriced: PricedMenuItem = {
      id: 'itm_promo',
      name: 'Promo Biryani',
      pricePaise: paise(10000),
      variants: [{ id: 'var_half', name: 'Half', priceDeltaPaise: paise(-15000) }],
      optionGroups: [],
    }
    rejects('invalid_price', () =>
      priceCart(
        [{ itemId: 'itm_promo', variantId: 'var_half', optionIds: [], qty: 1 }],
        [underpriced],
        { percent: 10 },
      ))
  })

  it('still allows a negative delta that leaves the line at or above zero', () => {
    const cart = priceCart([{ itemId: 'itm_biryani', variantId: 'var_half', optionIds: [], qty: 1 }], menu)
    assert.equal(cart.lines[0]?.unitPricePaise, 16000)
  })

  it('carries a code the voice service and the page can both act on', () => {
    try {
      priceCart([{ itemId: 'itm_ghost', optionIds: [], qty: 1 }], menu)
      assert.fail('expected a CartError')
    } catch (thrown) {
      assert.ok(thrown instanceof CartError)
      assert.equal(thrown.code, 'unknown_item')
      assert.match(thrown.message, /itm_ghost/)
    }
  })
})

// Finding unpriceable-cart-line-kills-cart: the repro was a saved cart line whose ids all still
// resolve but which an ordinary menu edit has made unpriceable. One such line used to throw for
// the whole cart; it must be dropped and the rest must still price.
describe('priceableLines', () => {
  it('drops a line that violates a group minimum and keeps the rest', () => {
    // The thali's Bread group is minSelect 1; this saved line chose nothing, as it could before
    // the owner made the group required.
    const kept = priceableLines(
      [
        { itemId: 'itm_thali', optionIds: [], qty: 1 },
        { itemId: 'itm_dosa', optionIds: [], qty: 2 },
      ],
      menu,
    )

    assert.deepEqual(kept, [{ itemId: 'itm_dosa', optionIds: [], qty: 2 }])
    assert.equal(priceCart(kept, menu).totalPaise, 24000)
  })

  it('drops a line whose group maximum was lowered under it', () => {
    const lowered: PricedMenuItem = {
      ...thali,
      optionGroups: thali.optionGroups.map((g) =>
        g.id === 'grp_extras' ? { ...g, maxSelect: 1 } : g),
    }
    const kept = priceableLines(
      [{ itemId: 'itm_thali', optionIds: ['opt_roti', 'opt_curd', 'opt_papad'], qty: 1 }],
      [lowered],
    )

    assert.deepEqual(kept, [])
  })

  it('drops a line the menu now prices below zero', () => {
    const underpriced: PricedMenuItem = {
      id: 'itm_promo',
      name: 'Promo Biryani',
      pricePaise: paise(10000),
      variants: [{ id: 'var_half', name: 'Half', priceDeltaPaise: paise(-15000) }],
      optionGroups: [],
    }

    assert.deepEqual(
      priceableLines([{ itemId: 'itm_promo', variantId: 'var_half', optionIds: [], qty: 1 }], [underpriced]),
      [],
    )
  })

  it('drops lines whose ids no longer resolve, as the id check did', () => {
    assert.deepEqual(
      priceableLines(
        [
          { itemId: 'itm_ghost', optionIds: [], qty: 1 },
          { itemId: 'itm_biryani', variantId: 'var_family', optionIds: [], qty: 1 },
          { itemId: 'itm_dosa', optionIds: [], qty: 0 },
        ],
        menu,
      ),
      [],
    )
  })

  it('leaves a cart every line of which still prices', () => {
    const lines = [
      { itemId: 'itm_dosa', optionIds: [], qty: 1 },
      { itemId: 'itm_thali', optionIds: ['opt_naan'], qty: 1 },
    ]

    assert.deepEqual(priceableLines(lines, menu), lines)
  })
})
