import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { costPaise, INR_PER_USD, PRICES, STT_PRICES, sttCostPaise } from './pricing.ts'

describe('pricing', () => {
  it('prices a 2,000-in / 300-out Haiku 4.5 call as the hand calculation says', () => {
    // $1.00/MTok × 2,000 = $0.0020; $5.00/MTok × 300 = $0.0015; $0.0035 × ₹84 = ₹0.294 = 29.4 paise,
    // rounded up to the paisa.
    assert.equal(costPaise('anthropic', { tokensIn: 2000, tokensOut: 300 }), 30)
  })

  it('prices Gemini 3.5 Flash Lite from its list price', () => {
    // $0.10/MTok × 2,000 + $0.40/MTok × 300 = $0.0002 + $0.00012 = $0.00032 × ₹84 = 2.688 paise → 3.
    assert.equal(costPaise('gemini', { tokensIn: 2000, tokensOut: 300 }), 3)
    assert.equal(costPaise('gemini', { tokensIn: 0, tokensOut: 0 }), 0)
    assert.equal(costPaise('mock', { tokensIn: 5000, tokensOut: 5000 }), 0)
  })

  it('holds the constants as the dated USD list prices times the rate', () => {
    assert.equal(INR_PER_USD, 84)
    assert.equal(PRICES.anthropic.inPaisePerMTok, 1.0 * 100 * INR_PER_USD)
    assert.equal(PRICES.anthropic.outPaisePerMTok, 5.0 * 100 * INR_PER_USD)
    assert.equal(PRICES.gemini.inPaisePerMTok, 0.1 * 100 * INR_PER_USD)
    assert.equal(PRICES.gemini.outPaisePerMTok, 0.4 * 100 * INR_PER_USD)
    for (const p of Object.values(PRICES)) {
      assert.ok(Number.isSafeInteger(p.inPaisePerMTok) && Number.isSafeInteger(p.outPaisePerMTok))
    }
  })

  it('refuses a provider it has no price for', () => {
    assert.throws(() => costPaise('openai', { tokensIn: 1, tokensOut: 1 }), /No LLM price for provider "openai"/)
  })
})

describe('speech to text pricing', () => {
  it('charges nothing for a recogniser on the restaurant\'s own machine', () => {
    // ADR 0007's whole argument: no per-minute price, and the audio never leaves the building.
    assert.equal(sttCostPaise('whisper', 600), 0)
    assert.equal(sttCostPaise('mock', 600), 0)
  })

  it('prices Sarvam by the minute, rounded up to the paisa', () => {
    // 50 paise a minute: a 60 s clip is 50, a 30 s clip is 25, and a 1 s clip is 1 rather than 0 —
    // a per-call charge that rounds to nothing would let §12's ₹15 alert never fire.
    assert.equal(sttCostPaise('sarvam', 60), 50)
    assert.equal(sttCostPaise('sarvam', 30), 25)
    assert.equal(sttCostPaise('sarvam', 1), 1)
    assert.equal(sttCostPaise('sarvam', 0), 0)
  })

  it('treats a negative duration as none rather than a credit', () => {
    assert.equal(sttCostPaise('sarvam', -30), 0)
  })

  it('refuses a provider it has no price for', () => {
    // A new adapter is priced before it goes live, or the ledger under-reports silently.
    assert.throws(() => sttCostPaise('deepgram', 60), /No STT price for provider "deepgram"/)
  })

  it('holds every price as a whole number of paise', () => {
    for (const p of Object.values(STT_PRICES)) assert.ok(Number.isSafeInteger(p.paisePerMinute))
  })
})
