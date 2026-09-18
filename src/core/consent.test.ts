import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { NOTICE_VERSION, assertConsentForProfileWrite, hasValidConsent } from './consent.ts'
import type { ConsentRecordView } from './consent.ts'

const granted = (over: Partial<ConsentRecordView> = {}): ConsentRecordView => ({
  noticeVersion: NOTICE_VERSION,
  purposes: ['order_fulfilment', 'order_history'],
  withdrawnAt: null,
  ...over,
})

describe('hasValidConsent', () => {
  it('accepts a live consent covering the purpose', () => {
    assert.equal(hasValidConsent(granted(), 'order_fulfilment'), true)
  })

  it('refuses when there is no consent record at all', () => {
    assert.equal(hasValidConsent(undefined, 'order_fulfilment'), false)
  })

  // Build Spec §10: withdrawal is one tap on the ordering page. It has to bite immediately.
  it('refuses a withdrawn consent even for a purpose it once covered', () => {
    const withdrawn = granted({ withdrawnAt: new Date('2026-09-18T10:00:00Z') })
    assert.equal(hasValidConsent(withdrawn, 'order_fulfilment'), false)
    assert.equal(hasValidConsent(withdrawn, 'order_history'), false)
  })

  // CLAUDE.md: notice texts are never edited in place, so a yes to v1 is not a yes to v2.
  it('refuses a consent granted against a stale notice version', () => {
    const stale = granted({ noticeVersion: 'v0' })
    assert.equal(hasValidConsent(stale, 'order_fulfilment'), false)
    assert.equal(hasValidConsent(stale, 'order_fulfilment', 'v0'), true)
  })

  it('refuses a purpose the customer did not agree to', () => {
    assert.equal(hasValidConsent(granted(), 'marketing'), false)
    assert.equal(hasValidConsent(granted({ purposes: [] }), 'order_fulfilment'), false)
  })

  it('ignores a purposes value outside the union', () => {
    // The column is text[], so this is reachable. It must fail closed, not throw.
    assert.equal(hasValidConsent(granted({ purposes: ['fulfilment'] }), 'order_fulfilment'), false)
  })
})

describe('assertConsentForProfileWrite', () => {
  it('permits the write when consent is live and covers the purpose', () => {
    assert.doesNotThrow(() => assertConsentForProfileWrite(granted(), 'order_history'))
  })

  it('blocks a write with no consent record', () => {
    assert.throws(() => assertConsentForProfileWrite(undefined, 'order_history'), /No valid consent/)
  })

  it('blocks a write after withdrawal', () => {
    const withdrawn = granted({ withdrawnAt: new Date('2026-09-18T10:00:00Z') })
    assert.throws(() => assertConsentForProfileWrite(withdrawn, 'order_history'), /No valid consent/)
  })

  it('blocks a write against a stale notice version', () => {
    const stale = granted({ noticeVersion: 'v0' })
    assert.throws(() => assertConsentForProfileWrite(stale, 'order_history'), /No valid consent/)
  })

  it('blocks a personalisation write under an order-only consent', () => {
    assert.throws(
      () => assertConsentForProfileWrite(granted(), 'personalisation'),
      /personalisation/,
    )
  })
})
