import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { canRedeem } from './codes.ts'
import type { DiscountCodeRules, RedemptionContext } from './codes.ts'

const RESTAURANT = 'r-1'

// A live win-back card: 10% off, one per phone, open all December. Ideation §8 flow 5.
const card = (over: Partial<DiscountCodeRules> = {}): DiscountCodeRules => ({
  restaurantId: RESTAURANT,
  kind: 'win_back_card',
  percent: 10,
  perCustomerLimit: 1,
  validFrom: new Date('2026-12-01T00:00:00Z'),
  validTo: new Date('2026-12-31T23:59:59Z'),
  isActive: true,
  ...over,
})

const scan = (over: Partial<RedemptionContext> = {}): RedemptionContext => ({
  restaurantId: RESTAURANT,
  priorRedemptions: 0,
  now: new Date('2026-12-15T12:00:00Z'),
  ...over,
})

describe('canRedeem', () => {
  it('allows a first scan inside the window and returns the percent', () => {
    assert.deepEqual(canRedeem(card(), scan()), { ok: true, percent: 10 })
  })

  it('refuses a code belonging to another restaurant', () => {
    const result = canRedeem(card({ restaurantId: 'r-2' }), scan())
    assert.deepEqual(result, { ok: false, reason: 'wrong_restaurant' })
  })

  it('refuses a deactivated code', () => {
    assert.deepEqual(canRedeem(card({ isActive: false }), scan()), { ok: false, reason: 'inactive' })
  })

  it('refuses before the window opens', () => {
    const result = canRedeem(card(), scan({ now: new Date('2026-11-30T23:59:59Z') }))
    assert.deepEqual(result, { ok: false, reason: 'not_yet_valid' })
  })

  it('refuses after the window closes', () => {
    const result = canRedeem(card(), scan({ now: new Date('2027-01-01T00:00:00Z') }))
    assert.deepEqual(result, { ok: false, reason: 'expired' })
  })

  it('treats both ends of the window as inclusive', () => {
    assert.equal(canRedeem(card(), scan({ now: new Date('2026-12-01T00:00:00Z') })).ok, true)
    assert.equal(canRedeem(card(), scan({ now: new Date('2026-12-31T23:59:59Z') })).ok, true)
  })

  it('allows an open-ended code with no dates', () => {
    const result = canRedeem(card({ validFrom: null, validTo: null }), scan())
    assert.deepEqual(result, { ok: true, percent: 10 })
  })

  // Build Spec §14 M1 acceptance: "a second redemption of the same code by the same phone is refused".
  it('refuses a second redemption by the same customer', () => {
    const result = canRedeem(card(), scan({ priorRedemptions: 1 }))
    assert.deepEqual(result, { ok: false, reason: 'already_redeemed' })
  })

  it('reports a multi-use code differently once its limit is spent', () => {
    const multi = card({ perCustomerLimit: 2 })
    assert.deepEqual(canRedeem(multi, scan({ priorRedemptions: 1 })), { ok: true, percent: 10 })
    assert.deepEqual(
      canRedeem(multi, scan({ priorRedemptions: 2 })),
      { ok: false, reason: 'limit_reached' },
    )
  })

  it('reports the wrong restaurant ahead of any other fault', () => {
    const wrongAndExpired = card({ restaurantId: 'r-2', isActive: false })
    const result = canRedeem(wrongAndExpired, scan({ now: new Date('2027-06-01T00:00:00Z') }))
    assert.deepEqual(result, { ok: false, reason: 'wrong_restaurant' })
  })
})
