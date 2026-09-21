import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  ABUSE_STRIKES, checkBeforeModel, isAbusive, LLM_FAIL_STRIKES, LOW_CONF, onLlmFailure, TURN_CAP,
  type GuardedState,
} from './guardrails.ts'

const fresh = (over: Partial<GuardedState> = {}): GuardedState => ({
  turnCount: 0,
  strikes: { abuse: 0, lowConfidence: 0, llmFailures: 0 },
  provider: 'primary',
  ...over,
})

describe('checkBeforeModel', () => {
  it('proceeds on an ordinary turn, and on typed text with no confidence', () => {
    assert.deepEqual(checkBeforeModel(fresh(), { text: 'two masala dosa', confidence: 0.9 }), {
      action: 'proceed', strikes: { abuse: 0, lowConfidence: 0, llmFailures: 0 },
    })
    assert.equal(checkBeforeModel(fresh(), { text: 'two masala dosa' }).action, 'proceed')
  })

  it('re-asks on the second low-confidence turn and hands off on the third (Build Spec §5.3)', () => {
    const low = { text: 'mumble', confidence: LOW_CONF - 0.1 }
    const first = checkBeforeModel(fresh(), low)
    assert.equal(first.action, 'proceed')
    assert.equal(first.strikes.lowConfidence, 1)

    const second = checkBeforeModel(fresh({ strikes: first.strikes }), low)
    assert.equal(second.action, 'reask')
    assert.equal(second.strikes.lowConfidence, 2)

    const third = checkBeforeModel(fresh({ strikes: second.strikes }), low)
    assert.deepEqual(third, { action: 'handoff', reason: 'low_confidence', strikes: { abuse: 0, lowConfidence: 3, llmFailures: 0 } })
  })

  it('clears the low-confidence count on one understood turn: the rule is consecutive', () => {
    const afterOne = checkBeforeModel(fresh(), { text: 'mumble', confidence: 0.2 }).strikes
    const clear = checkBeforeModel(fresh({ strikes: afterOne }), { text: 'two dosa', confidence: LOW_CONF })
    assert.equal(clear.action, 'proceed')
    assert.equal(clear.strikes.lowConfidence, 0)
  })

  it('hands off with reason cap once 24 caller turns have been answered', () => {
    assert.equal(checkBeforeModel(fresh({ turnCount: TURN_CAP - 1 }), { text: 'and a coffee' }).action, 'proceed')
    const capped = checkBeforeModel(fresh({ turnCount: TURN_CAP }), { text: 'and a coffee' })
    assert.equal(capped.action, 'handoff')
    assert.equal(capped.action === 'handoff' && capped.reason, 'cap')
  })

  it('ends the call abandoned on the second abusive turn', () => {
    const first = checkBeforeModel(fresh(), { text: 'you bastard, where is my food' })
    assert.equal(first.action, 'proceed')
    assert.equal(first.strikes.abuse, 1)
    const second = checkBeforeModel(fresh({ strikes: first.strikes }), { text: 'चुतिया कहीं का' })
    assert.deepEqual(second, { action: 'end', outcome: 'abandoned', reason: 'abuse', strikes: { abuse: ABUSE_STRIKES, lowConfidence: 0, llmFailures: 0 } })
  })

  it('does not score a misheard turn for abuse', () => {
    const v = checkBeforeModel(fresh(), { text: 'bastard', confidence: 0.1 })
    assert.equal(v.strikes.abuse, 0)
  })

  it('is pure: the session it is given is not touched', () => {
    const session = fresh({ turnCount: 3, strikes: { abuse: 1, lowConfidence: 1, llmFailures: 1 } })
    const before = structuredClone(session)
    checkBeforeModel(session, { text: 'bastard', confidence: 0.1 })
    onLlmFailure(session)
    assert.deepEqual(session, before)
  })
})

describe('onLlmFailure', () => {
  it('retries once, switches to the secondary on the second failure, transfers on the fourth', () => {
    const one = onLlmFailure(fresh())
    assert.deepEqual(one, { action: 'retry', strikes: { abuse: 0, lowConfidence: 0, llmFailures: 1 } })

    const two = onLlmFailure(fresh({ strikes: one.strikes }))
    assert.equal(two.action, 'switch')
    assert.equal(two.strikes.llmFailures, LLM_FAIL_STRIKES)

    const three = onLlmFailure(fresh({ strikes: two.strikes, provider: 'secondary' }))
    assert.equal(three.action, 'retry')

    const four = onLlmFailure(fresh({ strikes: three.strikes, provider: 'secondary' }))
    assert.deepEqual(four, { action: 'handoff', reason: 'vendor_error', strikes: { abuse: 0, lowConfidence: 0, llmFailures: 4 } })
  })

  it('does not switch a call that is already on the secondary', () => {
    const v = onLlmFailure(fresh({ strikes: { abuse: 0, lowConfidence: 0, llmFailures: 1 }, provider: 'secondary' }))
    assert.equal(v.action, 'retry')
  })
})

describe('isAbusive', () => {
  it('matches whole abusive words in English and Hindi, either script', () => {
    for (const text of ['FUCK this', 'you are a bastard', 'bhenchod jaldi karo', 'ये सब मादरचोद हैं', 'भोसड़ीके', 'abe gandu']) {
      assert.ok(isAbusive(text), text)
    }
  })

  it('stays conservative: ordinary, angry and food words pass', () => {
    for (const text of [
      'two masala dosa with coconut chutney', 'Gandhi Bazaar', 'this is bloody late', 'you are useless',
      'ek plate biryani', 'my order was wrong, I am very upset', 'randomly', 'चटनी ज़्यादा देना', '',
    ]) {
      assert.ok(!isAbusive(text), text)
    }
  })
})
