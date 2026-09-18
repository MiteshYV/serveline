import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { NOTICE_PURPOSES, NOTICE_VERSION, assertConsentForProfileWrite, hasValidConsent } from './consent.ts'
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
    // Even when v0 is the version being asked about: no notice v0 exists in NOTICE_PURPOSES,
    // so nothing is known about what it told the customer. Fail closed.
    assert.equal(hasValidConsent(stale, 'order_fulfilment', 'v0'), false)
  })

  it('refuses a purpose the customer did not agree to', () => {
    assert.equal(hasValidConsent(granted(), 'personalisation'), false)
    assert.equal(hasValidConsent(granted({ purposes: [] }), 'order_fulfilment'), false)
  })

  // The record says yes, but the notice the customer actually read never mentioned it. This is
  // the case a stray row or a route bug produces, and it must fail closed.
  it('refuses a purpose the signed notice version never described', () => {
    const v0 = granted({ noticeVersion: 'v0', purposes: ['order_fulfilment'] })
    assert.equal(hasValidConsent(v0, 'order_fulfilment', 'v0'), false)
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

// NOTICE_PURPOSES is a literal because core cannot read files. This is what stops it drifting
// from what the customer was actually shown. All three languages must declare the same set.
describe('NOTICE_PURPOSES matches the notice frontmatter', () => {
  for (const lang of ['en', 'hi', 'kn'] as const) {
    it(`${NOTICE_VERSION}/${lang}.md declares exactly the purposes core enforces`, () => {
      const md = readFileSync(`contracts/notices/${NOTICE_VERSION}/${lang}.md`, 'utf8')
      const frontmatter = md.split('---')[1] ?? ''
      const declared = [...frontmatter.matchAll(/^\s*-\s*(\w+)\s*$/gm)].map((m) => m[1])
      assert.deepEqual(declared, NOTICE_PURPOSES[NOTICE_VERSION])
    })
  }
})
