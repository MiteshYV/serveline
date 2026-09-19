import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { afterSkip, nagDecision, weekToAsk } from './aggregator-nag.ts'

// Saturday 19 Sept 2026, 11:00 IST.
const sat = new Date('2026-09-19T05:30:00Z')
const nextMon = new Date('2026-09-21T05:30:00Z')

describe('the Monday nag', () => {
  it('asks for the week just ended', () => {
    assert.equal(weekToAsk(sat), '2026-09-07')
    assert.equal(weekToAsk(nextMon), '2026-09-14')
  })

  it('shows until entered, never in a rush, and not again on the day it was skipped', () => {
    assert.equal(nagDecision({ now: sat, entered: false, rush: 0, cookie: null }), 'show')
    assert.equal(nagDecision({ now: sat, entered: true, rush: 0, cookie: null }), 'entered')
    assert.equal(nagDecision({ now: sat, entered: false, rush: 3, cookie: null }), 'rush')
    assert.equal(nagDecision({ now: sat, entered: false, rush: 2, cookie: null }), 'show')
    const skipped = afterSkip(null, sat)
    assert.equal(nagDecision({ now: sat, entered: false, rush: 0, cookie: skipped }), 'skipped_today')
    // The next day it is back.
    const sun = new Date('2026-09-20T05:30:00Z')
    assert.equal(nagDecision({ now: sun, entered: false, rush: 0, cookie: skipped }), 'show')
  })

  it('goes quiet for four weeks after three consecutive weekly skips', () => {
    const w1 = afterSkip(null, sat)
    assert.equal(w1.streak, 1)
    // Skipping again in the same week does not count twice.
    assert.equal(afterSkip(w1, new Date('2026-09-20T05:30:00Z')).streak, 1)
    const w2 = afterSkip(w1, nextMon)
    assert.equal(w2.streak, 2)
    const w3 = afterSkip(w2, new Date('2026-09-28T05:30:00Z'))
    assert.equal(w3.quietUntil, '2026-10-26')
    assert.equal(nagDecision({ now: new Date('2026-10-05T05:30:00Z'), entered: false, rush: 0, cookie: w3 }), 'quiet')
    assert.equal(nagDecision({ now: new Date('2026-10-26T05:30:00Z'), entered: false, rush: 0, cookie: w3 }), 'show')
    // A gap in the run resets the streak.
    assert.equal(afterSkip(w1, new Date('2026-10-05T05:30:00Z')).streak, 1)
  })
})
