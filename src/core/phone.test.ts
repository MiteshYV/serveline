import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hashPhone, normalisePhone } from './phone.ts'

test('normalisePhone accepts every format a customer types', () => {
  for (const input of [
    '9876543210',
    '+919876543210',
    '09876543210',
    '919876543210',
    '91 98765 43210',
    '+91 98765-43210',
    '  98765 43210  ',
    '98765-43210',
  ]) {
    assert.equal(normalisePhone(input), '+919876543210', input)
  }
})

test('normalisePhone accepts each valid mobile prefix', () => {
  assert.equal(normalisePhone('6012345678'), '+916012345678')
  assert.equal(normalisePhone('7012345678'), '+917012345678')
  assert.equal(normalisePhone('8012345678'), '+918012345678')
})

test('normalisePhone rejects what is not an Indian mobile', () => {
  assert.throws(() => normalisePhone('987654321'), /ten digits/) // nine digits
  assert.throws(() => normalisePhone('98765432100'), /ten digits/) // eleven digits
  assert.throws(() => normalisePhone('5876543210'), /ten digits/) // landline-range prefix
  assert.throws(() => normalisePhone('044 2345 6789'), /ten digits/) // Chennai landline
  assert.throws(() => normalisePhone('+14155552671'), /ten digits/) // not India
  assert.throws(() => normalisePhone(''), /only digits/)
  assert.throws(() => normalisePhone('98765abcde'), /only digits/)
  assert.throws(() => normalisePhone('+91 (98765) 43210'), /only digits/)
})

test('a rejection message carries no phone number, because it reaches the logs', () => {
  assert.throws(() => normalisePhone('5876543210'), (e: unknown) => {
    assert.ok(e instanceof Error)
    assert.ok(!e.message.includes('5876543210'))
    return true
  })
})

test('hashPhone is the frozen recipe: SHA-256 over pepper then number, hex', () => {
  assert.equal(
    hashPhone('+919876543210', 'test-pepper'),
    'a7167b374e083f402335b8dea54a073a33ddc8866e313425e4380f35fcf5d801',
  )
})

test('hashPhone separates numbers and peppers', () => {
  const hash = hashPhone('+919876543210', 'test-pepper')
  assert.equal(hash.length, 64)
  assert.notEqual(hash, hashPhone('+919876543211', 'test-pepper'))
  assert.notEqual(hash, hashPhone('+919876543210', 'other-pepper'))
})

test('hashPhone refuses an empty pepper', () => {
  // An unset environment variable must not quietly produce an unpeppered hash.
  assert.throws(() => hashPhone('+919876543210', ''), /pepper/)
})
