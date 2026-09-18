import assert from 'node:assert/strict'
import { test } from 'node:test'
import { applyPercentDiscount, formatINR, paise } from './money.ts'

test('paise accepts whole paise, including zero and a negative price delta', () => {
  assert.equal(paise(0), 0)
  assert.equal(paise(34700), 34700)
  assert.equal(paise(-5000), -5000)
})

test('paise rejects anything that is not a whole number of paise', () => {
  // A float here means rupees leaked in from somewhere.
  assert.throws(() => paise(347.5), TypeError)
  assert.throws(() => paise(0.1), TypeError)
  assert.throws(() => paise(Number.NaN), TypeError)
  assert.throws(() => paise(Number.POSITIVE_INFINITY), TypeError)
  assert.throws(() => paise(2 ** 53), TypeError)
})

test('formatINR renders rupees with Indian digit grouping', () => {
  assert.equal(formatINR(paise(0)), '₹0.00')
  assert.equal(formatINR(paise(1)), '₹0.01')
  assert.equal(formatINR(paise(34700)), '₹347.00')
  assert.equal(formatINR(paise(10_000_000)), '₹1,00,000.00')
  assert.equal(formatINR(paise(-1250)), '-₹12.50')
})

test('applyPercentDiscount takes the win-back card 10% off a typical bill', () => {
  assert.equal(applyPercentDiscount(paise(34700), 10), 31230)
  assert.equal(applyPercentDiscount(paise(40000), 10), 36000)
})

test('applyPercentDiscount rounds the discount up, in the customer’s favour', () => {
  // 10% of 347 paise is 34.7 — the customer gets 35 off, not 34.
  assert.equal(applyPercentDiscount(paise(347), 10), 312)
  // The boundary: 10% of a single paise still discounts a whole paise.
  assert.equal(applyPercentDiscount(paise(1), 10), 0)
  assert.equal(applyPercentDiscount(paise(9), 15), 7)
})

test('applyPercentDiscount handles the ends of the range without going negative', () => {
  assert.equal(applyPercentDiscount(paise(34700), 0), 34700)
  assert.equal(applyPercentDiscount(paise(34700), 100), 0)
  assert.equal(applyPercentDiscount(paise(0), 10), 0)
  assert.equal(applyPercentDiscount(paise(1), 99), 0)
})

test('applyPercentDiscount rejects a percent the discount_code column cannot hold', () => {
  assert.throws(() => applyPercentDiscount(paise(34700), 10.5), RangeError)
  assert.throws(() => applyPercentDiscount(paise(34700), 101), RangeError)
  assert.throws(() => applyPercentDiscount(paise(34700), -1), RangeError)
})

test('applyPercentDiscount rejects a negative subtotal', () => {
  assert.throws(() => applyPercentDiscount(paise(-100), 10), RangeError)
})
