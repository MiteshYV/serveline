import assert from 'node:assert/strict'
import { test } from 'node:test'
import { decodeJwt } from 'jose'
import { signSession, verifySession } from './jwt.ts'

// node --test sets no NODE_ENV, and secrets.ts derives a dev key only under `next dev`.
process.env.SESSION_SECRET ??= 'test-session-secret'

test('a signed session verifies back to the same claims', async () => {
  const token = await signSession({ audience: 'staff', subjectId: 'u1', restaurantId: 'r1', role: 'owner' })
  assert.deepEqual(await verifySession(token, 'staff'), {
    audience: 'staff', subjectId: 'u1', restaurantId: 'r1', role: 'owner',
  })
})

test('optional claims stay absent rather than becoming undefined properties', async () => {
  const token = await signSession({ audience: 'customer', subjectId: 'c1' })
  assert.deepEqual(await verifySession(token, 'customer'), { audience: 'customer', subjectId: 'c1' })
})

test('a token minted for one audience is null for another', async () => {
  const token = await signSession({ audience: 'staff', subjectId: 'u1', restaurantId: 'r1', role: 'staff' })
  assert.equal(await verifySession(token, 'platform'), null)
})

test('a tampered token is null', async () => {
  const token = await signSession({ audience: 'customer', subjectId: 'c1' })
  const [h, p, s] = token.split('.') as [string, string, string]
  const forged = Buffer.from(JSON.stringify({ ...decodeJwt(token), sub: 'c2' })).toString('base64url')
  assert.equal(await verifySession(`${h}.${forged}.${s}`, 'customer'), null)
  assert.equal(await verifySession(`${h}.${p}.${s.slice(0, -2)}AA`, 'customer'), null)
  assert.equal(await verifySession('not-a-jwt', 'customer'), null)
})

test('Build Spec §3: customer sessions last 30 days, staff and platform 7', async () => {
  const ttl = async (audience: 'customer' | 'staff' | 'platform') => {
    const { iat, exp } = decodeJwt(await signSession({ audience, subjectId: 'x' }))
    return (exp ?? 0) - (iat ?? 0)
  }
  assert.equal(await ttl('customer'), 30 * 86_400)
  assert.equal(await ttl('staff'), 7 * 86_400)
  assert.equal(await ttl('platform'), 7 * 86_400)
})

test('with no SESSION_SECRET only `next dev` gets a derived key; every other NODE_ENV refuses to sign', async () => {
  const env = process.env as Record<string, string | undefined> // Next types NODE_ENV read-only
  const saved = { NODE_ENV: env.NODE_ENV, SESSION_SECRET: env.SESSION_SECRET }
  delete env.SESSION_SECRET
  try {
    for (const mode of ['production', 'staging', 'test', undefined]) {
      if (mode === undefined) delete env.NODE_ENV
      else env.NODE_ENV = mode
      await assert.rejects(signSession({ audience: 'customer', subjectId: 'c1' }), /SESSION_SECRET/, `NODE_ENV=${mode}`)
    }
    env.NODE_ENV = 'development'
    assert.match(await signSession({ audience: 'customer', subjectId: 'c1' }), /^eyJ/)
  } finally {
    if (saved.NODE_ENV === undefined) delete env.NODE_ENV
    else env.NODE_ENV = saved.NODE_ENV
    if (saved.SESSION_SECRET !== undefined) env.SESSION_SECRET = saved.SESSION_SECRET
  }
})

test('an address token round-trips its order id and is not a session', async () => {
  const { signAddressToken, verifyAddressToken } = await import('./jwt.ts')
  const token = await signAddressToken('order-1')
  assert.equal(await verifyAddressToken(token), 'order-1')
  assert.equal(await verifySession(token, 'customer'), null)
  assert.equal(await verifyAddressToken(`${token}x`), null)
})
