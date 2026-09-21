import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { costPaise, INR_PER_USD, PRICES } from './pricing.ts'

describe('pricing', () => {
  it('prices a 2,000-in / 300-out Haiku 4.5 call as the hand calculation says', () => {
    // $1.00/MTok × 2,000 = $0.0020; $5.00/MTok × 300 = $0.0015; $0.0035 × ₹84 = ₹0.294 = 29.4 paise,
    // rounded up to the paisa.
    assert.equal(costPaise('anthropic', { tokensIn: 2000, tokensOut: 300 }), 30)
  })

  it('prices Gemini 2.5 Flash from its list price', () => {
    // $0.30/MTok × 2,000 + $2.50/MTok × 300 = $0.0006 + $0.00075 = $0.00135 × ₹84 = 11.34 paise → 12.
    assert.equal(costPaise('gemini', { tokensIn: 2000, tokensOut: 300 }), 12)
    assert.equal(costPaise('gemini', { tokensIn: 0, tokensOut: 0 }), 0)
    assert.equal(costPaise('mock', { tokensIn: 5000, tokensOut: 5000 }), 0)
  })

  it('holds the constants as the dated USD list prices times the rate', () => {
    assert.equal(INR_PER_USD, 84)
    assert.equal(PRICES.anthropic.inPaisePerMTok, 1.0 * 100 * INR_PER_USD)
    assert.equal(PRICES.anthropic.outPaisePerMTok, 5.0 * 100 * INR_PER_USD)
    assert.equal(PRICES.gemini.inPaisePerMTok, 0.3 * 100 * INR_PER_USD)
    assert.equal(PRICES.gemini.outPaisePerMTok, 2.5 * 100 * INR_PER_USD)
    for (const p of Object.values(PRICES)) {
      assert.ok(Number.isSafeInteger(p.inPaisePerMTok) && Number.isSafeInteger(p.outPaisePerMTok))
    }
  })

  it('refuses a provider it has no price for', () => {
    assert.throws(() => costPaise('openai', { tokensIn: 1, tokensOut: 1 }), /No LLM price for provider "openai"/)
  })
})
