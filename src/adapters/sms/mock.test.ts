import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { sms } from './index.ts'
import { COST_PER_SEGMENT_PAISE, mockInbox, mockSmsAdapter as adapter, smsSegments } from './mock.ts'
import { TEMPLATES } from './templates.ts'

afterEach(() => mockInbox.clear())

const to = '+919876543210'
const otpVars = { code: '482913' }

test('the inbox receives an OTP rendered in each language, newest first', async () => {
  for (const language of ['en', 'hi', 'kn'] as const) {
    const { providerMessageId, costPaise } = await adapter.send({ toPhone: to, kind: 'otp', language, vars: otpVars })
    assert.match(providerMessageId, /^mock-sms-/)
    assert.ok(costPaise >= COST_PER_SEGMENT_PAISE)
  }
  const [kn, hi, en] = mockInbox.list()
  assert.equal(mockInbox.list().length, 3)
  assert.equal(kn?.language, 'kn')
  assert.equal(hi?.language, 'hi')
  assert.equal(en?.language, 'en')

  // Each renders in its own script and carries the code.
  assert.match(en?.text ?? '', /^482913 is your ServeLine code/)
  assert.match(hi?.text ?? '', /[\u0900-\u097F]/)
  assert.match(kn?.text ?? '', /[\u0C80-\u0CFF]/)
  for (const m of [en, hi, kn]) {
    assert.ok(m?.text.includes('482913'))
    assert.equal(m?.toPhone, to)
    assert.match(m?.dltTemplateId ?? '', /^dlt_placeholder_otp_/)
  }
})

test('every kind renders in every language with no unfilled slot', async () => {
  const vars = {
    ...otpVars, restaurant: 'Udupi Grand', items: '2x Masala Dosa', total: 'Rs 312', paymentMode: 'UPI', url: 'https://serveline.in/r/udupi',
  }
  for (const kind of Object.keys(TEMPLATES) as (keyof typeof TEMPLATES)[]) {
    for (const language of ['en', 'hi', 'kn'] as const) {
      await adapter.send({ toPhone: to, kind, language, vars })
      assert.doesNotMatch(mockInbox.list()[0]?.text ?? '', /\{\w+\}/, `${kind}/${language} left a slot unfilled`)
    }
  }
  assert.equal(mockInbox.list().length, 15)
})

test('a missing template variable throws before anything is sent', async () => {
  await assert.rejects(
    adapter.send({ toPhone: to, kind: 'payment_link', language: 'en', vars: { restaurant: 'X', total: 'Rs 1' } }),
    /needs variable "url"/,
  )
  assert.equal(mockInbox.list().length, 0)
})

test('cost follows segments: Indic text is UCS-2 and costs more than the same message in English', async () => {
  const vars = { restaurant: 'Udupi Grand', items: '2x Masala Dosa, 1x Filter Coffee', total: 'Rs 312', paymentMode: 'UPI' }
  const en = await adapter.send({ toPhone: to, kind: 'order_confirm', language: 'en', vars })
  const hi = await adapter.send({ toPhone: to, kind: 'order_confirm', language: 'hi', vars })
  assert.equal(en.costPaise, COST_PER_SEGMENT_PAISE)
  assert.ok(hi.costPaise > en.costPaise)

  assert.equal(smsSegments('a'.repeat(160)), 1)
  assert.equal(smsSegments('a'.repeat(161)), 2)
  assert.equal(smsSegments('क'.repeat(70)), 1)
  assert.equal(smsSegments('क'.repeat(71)), 2)
  // One ₹ is enough to make an English message UCS-2.
  assert.equal(smsSegments('₹' + 'a'.repeat(70)), 2)
})

test('the inbox caps at 200, dropping the oldest', async () => {
  for (let i = 0; i < 201; i++) {
    await adapter.send({ toPhone: to, kind: 'page_link', language: 'en', vars: { restaurant: 'X', url: `u${i}` } })
  }
  const list = mockInbox.list()
  assert.equal(list.length, 200)
  assert.ok(list[0]?.text.endsWith('u200'))
  assert.ok(list[199]?.text.endsWith('u1'))
})

test('VENDOR_MODE=live fails loudly instead of falling back to the mock', () => {
  const saved = process.env.VENDOR_MODE
  try {
    process.env.VENDOR_MODE = 'live'
    assert.throws(() => sms(), /not configured: SMS_PROVIDER/)
    process.env.VENDOR_MODE = 'mock'
    assert.equal(sms(), adapter)
  } finally {
    if (saved === undefined) delete process.env.VENDOR_MODE
    else process.env.VENDOR_MODE = saved
  }
})
