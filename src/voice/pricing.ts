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
    model: 'gemini-2.5-flash',
    // ai.google.dev/gemini-api/docs/pricing, paid tier, text: $0.30 in, $2.50 out. Verified 2026-09-20.
    inPaisePerMTok: 30 * INR_PER_USD,
    outPaisePerMTok: 250 * INR_PER_USD,
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
