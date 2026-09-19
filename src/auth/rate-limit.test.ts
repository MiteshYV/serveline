import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createLimiter } from './rate-limit.ts'

test('five hits pass, the sixth is refused, and the window slides', () => {
  const limiter = createLimiter(5, 10 * 60 * 1000)
  const t0 = 1_000_000
  for (let i = 0; i < 5; i++) assert.equal(limiter.hit('k', t0 + i), true, `hit ${i + 1}`)
  assert.equal(limiter.hit('k', t0 + 5), false)
  assert.equal(limiter.hit('other', t0 + 5), true) // keys are independent
  assert.equal(limiter.hit('k', t0 + 10 * 60 * 1000 - 1), false) // first hit still inside the window
  assert.equal(limiter.hit('k', t0 + 10 * 60 * 1000), true) // first hit has aged out; four remain
})
