import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { payments } from './index.ts'
import { mockPayments, mockPaymentsAdapter as adapter } from './mock.ts'

afterEach(() => mockPayments.clear())

const input = { orderId: 'order-1', amountPaise: 31230, restaurantId: 'rest-1', description: 'Order #1' }

test('createLink → markPaid → verifyWebhook → parseWebhook round-trips the link id and amount', async () => {
  const before = Date.now()
  const { linkId, url, expiresAt } = await adapter.createLink(input)

  assert.match(linkId, /^plink_mock_[0-9a-f]{32}$/)
  assert.equal(url, `/mock/pay/${linkId}`)
  // Build Spec §9: 30-minute expiry.
  const ttl = expiresAt.getTime() - before
  assert.ok(ttl > 29 * 60 * 1000 && ttl <= 30 * 60 * 1000 + 1000, `ttl was ${ttl}ms`)

  const { rawBody, signature } = mockPayments.markPaid(linkId)
  assert.equal(adapter.verifyWebhook(rawBody, signature), true)

  const parsed = adapter.parseWebhook(rawBody)
  assert.equal(parsed.event, 'payment_link.paid')
  assert.equal(parsed.linkId, linkId)
  assert.match(parsed.paymentId, /^pay_mock_/)
  assert.equal(parsed.amountPaise, 31230)
  assert.equal(mockPayments.get(linkId)?.status, 'paid')
})

test('a tampered signature or a tampered body is refused', async () => {
  const { linkId } = await adapter.createLink(input)
  const { rawBody, signature } = mockPayments.markPaid(linkId)

  const flipped = (signature.startsWith('0') ? '1' : '0') + signature.slice(1)
  assert.equal(adapter.verifyWebhook(rawBody, flipped), false)
  assert.equal(adapter.verifyWebhook(rawBody.replace('31230', '1'), signature), false)
  assert.equal(adapter.verifyWebhook(rawBody, ''), false)
  assert.equal(adapter.verifyWebhook(rawBody, 'not-hex'), false)
})

test('a retried webhook carries the same payment id', async () => {
  const { linkId } = await adapter.createLink(input)
  const first = adapter.parseWebhook(mockPayments.markPaid(linkId).rawBody)
  const second = adapter.parseWebhook(mockPayments.markPaid(linkId).rawBody)
  assert.equal(first.paymentId, second.paymentId)
})

test('parseWebhook classifies other events and rejects non-events', () => {
  const expired = JSON.stringify({
    event: 'payment_link.expired',
    payload: { payment_link: { entity: { id: 'plink_x', amount_paid: 0 } } },
  })
  assert.deepEqual(adapter.parseWebhook(expired), { event: 'other', linkId: 'plink_x', paymentId: '', amountPaise: 0 })
  assert.throws(() => adapter.parseWebhook('not json'), /not JSON/)
  assert.throws(() => adapter.parseWebhook('{"hello":"world"}'), /expected event shape/)
})

test('createLink refuses a non-positive or non-integer amount', async () => {
  await assert.rejects(adapter.createLink({ ...input, amountPaise: 0 }), RangeError)
  await assert.rejects(adapter.createLink({ ...input, amountPaise: 312.3 }), TypeError)
  assert.throws(() => mockPayments.markPaid('plink_unknown'), /Unknown/)
})

test('VENDOR_MODE=live fails loudly instead of falling back to the mock', () => {
  const saved = process.env.VENDOR_MODE
  try {
    process.env.VENDOR_MODE = 'live'
    assert.throws(() => payments(), /not configured: RAZORPAY_KEY_ID/)
    process.env.VENDOR_MODE = 'mock'
    assert.equal(payments(), adapter)
  } finally {
    if (saved === undefined) delete process.env.VENDOR_MODE
    else process.env.VENDOR_MODE = saved
  }
})
