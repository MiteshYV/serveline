import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CALL_ALLOWANCE, SUBSCRIPTION_PAISE, TRIAL_CALL_LIMIT, estimateInvoice } from './billing.ts'

// Build Spec §14 M5's worked example, reused here so the arithmetic is pinned from day one:
// 620 calls and ₹80,000 of channel orders → ₹4,999 + ₹600 + ₹1,600.
test('estimateInvoice matches the Build Spec worked example', () => {
  const e = estimateInvoice({ aiCalls: 620, channelValuePaise: 80_000_00 })
  assert.equal(e.overageCalls, 120)
  assert.equal(e.overagePaise, 600_00)
  assert.equal(e.feePaise, 1_600_00)
  assert.equal(e.totalPaise, 4_999_00 + 600_00 + 1_600_00)
})

test('no overage inside the allowance, and the fee rounds down to the paisa', () => {
  const e = estimateInvoice({ aiCalls: 0, channelValuePaise: 12_345 }) // ₹123.45 → 2% = ₹2.469
  assert.equal(e.overagePaise, 0)
  assert.equal(e.feePaise, 246)
  assert.equal(e.totalPaise, 4_999_00 + 246)
})

// Finding trial-invoice-charges-subscription. Build Spec §13 / Ideation §10: "30 days from
// trial_started_at or 150 allowance calls, whichever first". Before this, a trialing restaurant's
// first billing screen read "Estimated invoice ₹5,005.30 / Subscription ₹4,999.00 / 0 calls
// beyond 500" while the Plan card beside it said the trial was free.
test('a restaurant inside its trial owes no subscription', () => {
  const e = estimateInvoice({ aiCalls: 0, channelValuePaise: 12_345, trialing: true, trialCallLimit: 150 })
  assert.equal(e.subscriptionPaise, 0)
  assert.equal(e.overagePaise, 0)
  assert.equal(e.feePaise, 246)
  assert.equal(e.totalPaise, 246)
})

test('the trial measures calls against the restaurant trial limit, not the plan allowance', () => {
  const e = estimateInvoice({ aiCalls: 200, channelValuePaise: 0, trialing: true, trialCallLimit: 150 })
  assert.equal(e.allowance, 150)
  assert.equal(e.overageCalls, 50)
  // §13 answers the trial limit with a conversion screen, not a bill.
  assert.equal(e.overagePaise, 0)
  assert.equal(e.totalPaise, 0)
})

test('the trial limit falls back to the documented 150 when none is passed', () => {
  assert.equal(estimateInvoice({ aiCalls: 0, channelValuePaise: 0, trialing: true }).allowance, TRIAL_CALL_LIMIT)
  assert.equal(TRIAL_CALL_LIMIT, 150)
})

// Build Spec §13 puts the 2% on delivered ServeLine-channel orders with no trial exemption.
test('the 2% fee is charged during the trial', () => {
  const e = estimateInvoice({ aiCalls: 0, channelValuePaise: 80_000_00, trialing: true })
  assert.equal(e.feePaise, 1_600_00)
  assert.equal(e.totalPaise, 1_600_00)
})

test('a paying restaurant is unaffected and keeps the plan allowance', () => {
  const e = estimateInvoice({ aiCalls: 620, channelValuePaise: 80_000_00 })
  assert.equal(e.allowance, CALL_ALLOWANCE)
  assert.equal(e.subscriptionPaise, SUBSCRIPTION_PAISE)
  assert.equal(e.overageCalls, 120)
})
