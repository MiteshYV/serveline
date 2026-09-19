import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hashPhone } from '../core/phone.ts'
import { RateLimitedError, issueOtp, mintChallenge, verifyOtp } from './otp.ts'
import { phonePepper } from './secrets.ts'

// Each test uses its own number so the per-phone limiter never bleeds between tests.
const phone = (n: number) => `+9198765${String(n).padStart(5, '0')}`
const ctx = { origin: 'localhost:3000' }

test('issue then verify round-trips through the mock adapter and devCode', async () => {
  const { challenge, devCode } = await issueOtp(phone(1), ctx)
  assert.match(devCode ?? '', /^\d{6}$/, 'VENDOR_MODE=mock returns the code for the demo UI')
  assert.ok(!challenge.includes(devCode ?? 'x'), 'the code is not in the challenge')
  assert.equal(await verifyOtp(phone(1), devCode ?? '', challenge), true)
})

test('the wrong code fails', async () => {
  const { challenge, devCode } = await issueOtp(phone(2), ctx)
  const wrong = devCode === '000000' ? '000001' : '000000'
  assert.equal(await verifyOtp(phone(2), wrong, challenge), false)
  assert.equal(await verifyOtp(phone(2), '', challenge), false)
  assert.equal(await verifyOtp(phone(2), 'abcdef', challenge), false)
})

test('a challenge for one phone does not verify another', async () => {
  const { challenge, devCode } = await issueOtp(phone(3), ctx)
  assert.equal(await verifyOtp(phone(4), devCode ?? '', challenge), false)
})

test('an expired challenge fails', async () => {
  const hash = hashPhone(phone(5), phonePepper())
  const fresh = mintChallenge(hash, '123456')
  assert.equal(await verifyOtp(phone(5), '123456', fresh), true)
  const stale = mintChallenge(hash, '123456', Date.now() - 10 * 60 * 1000 - 1)
  assert.equal(await verifyOtp(phone(5), '123456', stale), false)
})

test('a tampered challenge fails', async () => {
  const hash = hashPhone(phone(6), phonePepper())
  const challenge = mintChallenge(hash, '123456')
  const [payload, tag] = challenge.split('.') as [string, string]

  const claims = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { p: string; e: number }
  const extended = Buffer.from(JSON.stringify({ ...claims, e: claims.e + 86_400_000 })).toString('base64url')
  assert.equal(await verifyOtp(phone(6), '123456', `${extended}.${tag}`), false)

  const flipped = (tag.at(-1) === 'A' ? 'B' : 'A') + tag.slice(1)
  assert.equal(await verifyOtp(phone(6), '123456', `${payload}.${flipped}`), false)
  assert.equal(await verifyOtp(phone(6), '123456', `${payload}.${tag}.extra`), false)
  assert.equal(await verifyOtp(phone(6), '123456', 'garbage'), false)
})

test('the sixth issue for a phone in ten minutes is refused', async () => {
  for (let i = 0; i < 5; i++) await issueOtp(phone(7), ctx)
  await assert.rejects(issueOtp(phone(7), ctx), RateLimitedError)
})

test('the sixth issue from an IP in ten minutes is refused across phones', async () => {
  for (let i = 0; i < 5; i++) await issueOtp(phone(10 + i), { ...ctx, ip: '203.0.113.9' })
  await assert.rejects(issueOtp(phone(15), { ...ctx, ip: '203.0.113.9' }), RateLimitedError)
})

test('the sixth verify attempt for a phone in ten minutes is refused', async () => {
  const { challenge } = await issueOtp(phone(8), ctx)
  for (let i = 0; i < 5; i++) await verifyOtp(phone(8), '000000', challenge)
  await assert.rejects(verifyOtp(phone(8), '000000', challenge), RateLimitedError)
})
