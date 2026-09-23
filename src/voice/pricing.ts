/**
 * LLM list prices for the cost ledger (M2 design "Cost ledger"; Build Spec §4 `call_cost`, §9
 * "Log tokens per call"). Build Spec §12 alerts at ₹15 a call and guardrails at ₹20, so these
 * numbers decide when the alarm rings: re-check them against the first real invoice, and
 * whenever a vendor reprices.
 *
 * Money in paise (CLAUDE.md). USD list prices are held in cents so every paise figure is an
 * exact integer, and the rate is one constant so a rupee move is a one-line change.
 */

import { paise, type Paise } from '../core/money.ts'

/** ₹ per US dollar, rounded from the RBI reference rate. 2026-09-20. */
export const INR_PER_USD = 84

/** When these prices were last read off the vendors' pages. */
export const PRICES_AS_OF = '2026-09-20'

// cents per million tokens × ₹ per dollar = paise per million tokens.
export const PRICES = {
  gemini: {
    // ADR 0006: the model moved to the lite tier because a phone call cannot wait for the full
    // Flash models. Pricing is the lite tier's, and lower than the 2.5 Flash line the Build Spec
    // §10 cost table assumed — the ₹8–20 per call estimate there still holds with room to spare.
    model: 'gemini-3.5-flash-lite',
    // ai.google.dev/gemini-api/docs/pricing, paid tier, text: $0.10 in, $0.40 out.
    // UNVERIFIED at 2026-09-21 — the pricing page was not reachable from here; re-check at kickoff.
    inPaisePerMTok: 10 * INR_PER_USD,
    outPaisePerMTok: 40 * INR_PER_USD,
  },
  anthropic: {
    model: 'claude-haiku-4-5',
    // anthropic.com/pricing: $1.00 in, $5.00 out. Verified 2026-09-20.
    inPaisePerMTok: 100 * INR_PER_USD,
    outPaisePerMTok: 500 * INR_PER_USD,
  },
  // The scripted mock (src/adapters/llm/mock.ts) reports usage so the ledger path is exercised,
  // and costs nothing. Priced here so the loop treats every adapter alike and an unpriced
  // provider still throws below.
  mock: { model: 'mock', inPaisePerMTok: 0, outPaisePerMTok: 0 },
  // A model on the restaurant's own machine has no per-token price. Electricity is not a token
  // cost, and Build Spec §13 bills calls, not watts.
  ollama: { model: 'local', inPaisePerMTok: 0, outPaisePerMTok: 0 },
} as const satisfies Record<string, { model: string; inPaisePerMTok: number; outPaisePerMTok: number }>

export type PricedProvider = keyof typeof PRICES

/**
 * One model call's cost, rounded up to the paisa. `provider` is the adapter's `provider` string;
 * a name with no price is a programmer error — a new adapter is priced here before it goes live,
 * or the ledger under-reports and §12's alert never fires.
 */
export function costPaise(provider: string, usage: { tokensIn: number; tokensOut: number }): Paise {
  const price = (PRICES as Record<string, (typeof PRICES)[PricedProvider] | undefined>)[provider]
  if (!price) throw new Error(`No LLM price for provider "${provider}"; add it to src/voice/pricing.ts`)
  return paise(Math.ceil((usage.tokensIn * price.inPaisePerMTok + usage.tokensOut * price.outPaisePerMTok) / 1_000_000))
}

/**
 * Speech to text, priced by the minute because that is how speech vendors bill.
 *
 * Build Spec §10's cost table budgets speech at roughly a third of a call. That assumed Sarvam;
 * ADR 0007 put whisper on the restaurant's own machine instead, where the per-call speech cost is
 * zero and the §12 alert has that much more headroom. Worth remembering when Sarvam is switched
 * on: it is not a swap, it is a new line on the invoice.
 */
export const STT_PRICES = {
  // On the restaurant's own hardware (ADR 0007). Electricity is not a per-second price, and
  // Build Spec §13 bills calls, not watts — the same reasoning as `ollama` above.
  whisper: { model: 'large-v3-turbo', paisePerMinute: 0 },
  // UNVERIFIED. Sarvam publishes ₹0.50 a minute for Saarika at the time of writing, but there is
  // no account to confirm it against and no invoice to check it with. Re-read this before the
  // first real call: the ledger feeds §12's ₹15 alert, and a wrong price means a bell that never
  // rings. See src/adapters/stt/sarvam.ts, which has never received a 200 either.
  sarvam: { model: 'saarika:v2', paisePerMinute: 50 },
  // Priced so the loop treats every adapter alike and the ledger path is exercised in mock mode.
  mock: { model: 'mock', paisePerMinute: 0 },
} as const satisfies Record<string, { model: string; paisePerMinute: number }>

export type PricedSttProvider = keyof typeof STT_PRICES

/**
 * One clip's cost, rounded up to the paisa. Seconds rather than minutes at the call site because
 * that is what an adapter can actually measure; the division happens here, once.
 *
 * An unpriced provider throws, for the same reason `costPaise` does: a new adapter is priced
 * before it goes live, or the ledger under-reports and §12's alert never fires.
 */
export function sttCostPaise(provider: string, seconds: number): Paise {
  const price = (STT_PRICES as Record<string, (typeof STT_PRICES)[PricedSttProvider] | undefined>)[provider]
  if (!price) throw new Error(`No STT price for provider "${provider}"; add it to src/voice/pricing.ts`)
  return paise(Math.ceil((Math.max(seconds, 0) * price.paisePerMinute) / 60))
}
