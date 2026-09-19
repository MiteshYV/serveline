import assert from 'node:assert/strict'
import { test } from 'node:test'
import { estimateInvoice } from './billing.ts'

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
