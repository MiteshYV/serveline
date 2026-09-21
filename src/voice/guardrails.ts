/**
 * The call guardrails, Build Spec §5.3 in the M2 design's text-adapted form (its table):
 *
 *   confidence   two caller turns under 0.6 → re-ask once; a third → handoff `low_confidence`
 *   turn cap     24 caller turns stand in for the six-minute wall clock → handoff `cap`
 *   abuse        two abusive turns → the call ends `abandoned`, reason `abuse`
 *   outage       two LLM failures → the secondary provider; two more → handoff `vendor_error`
 *
 * Pure functions over the session's counters: each returns the action for the loop to take and
 * the counters as they stand after this turn, and mutates nothing. The loop stores the counters
 * and applies the action, so the rules are testable without a call and the loop has no rules of
 * its own. Silence and barge-in are the mic surface's (design, "Guardrails").
 */

import type { Session } from './session.ts'

export const TURN_CAP = 24
export const LOW_CONF = 0.6
export const ABUSE_STRIKES = 2
export const LLM_FAIL_STRIKES = 2

export type Strikes = Session['strikes']

/** The fields of a Session the guardrails read. A Session is assignable. */
export type GuardedState = Pick<Session, 'turnCount' | 'strikes' | 'provider'>

/** What the surface posted for this caller turn. `confidence` is absent for typed text. */
export type CallerTurn = { text: string; confidence?: number }

export type BeforeModelVerdict = (
  | { action: 'proceed' }
  | { action: 'reask' }
  | { action: 'handoff'; reason: 'cap' | 'low_confidence' }
  | { action: 'end'; outcome: 'abandoned'; reason: 'abuse' }
) & { strikes: Strikes }

/**
 * Runs before the caller's text reaches the model. `session.turnCount` is the number of caller
 * turns before this one; the loop increments it once the verdict is in, whatever the verdict.
 *
 * Order matters: the cap is checked first because a capped call answers nothing more; a low-
 * confidence turn is not scored for abuse because it was not understood; abuse ends the call
 * before a re-ask is considered.
 */
export function checkBeforeModel(session: GuardedState, turn: CallerTurn): BeforeModelVerdict {
  const strikes = { ...session.strikes }

  if (session.turnCount >= TURN_CAP) return { action: 'handoff', reason: 'cap', strikes }

  // "Consecutive" (Build Spec §5.3): one understood turn clears the count.
  const low = turn.confidence !== undefined && turn.confidence < LOW_CONF
  strikes.lowConfidence = low ? strikes.lowConfidence + 1 : 0
  if (strikes.lowConfidence >= 3) return { action: 'handoff', reason: 'low_confidence', strikes }
  if (strikes.lowConfidence === 2) return { action: 'reask', strikes }
  if (low) return { action: 'proceed', strikes }

  if (isAbusive(turn.text)) strikes.abuse += 1
  if (strikes.abuse >= ABUSE_STRIKES) return { action: 'end', outcome: 'abandoned', reason: 'abuse', strikes }

  return { action: 'proceed', strikes }
}

export type LlmFailureVerdict = (
  | { action: 'retry' }
  | { action: 'switch'; provider: 'secondary' }
  | { action: 'handoff'; reason: 'vendor_error' }
) & { strikes: Strikes }

/**
 * Runs when the adapter throws. Each provider gets LLM_FAIL_STRIKES failures: the primary's
 * second failure moves the call to the secondary (design acceptance 6: "the secondary provider
 * answers the next turn"), and the secondary's second failure is the outage §5.3 transfers on.
 */
export function onLlmFailure(session: GuardedState): LlmFailureVerdict {
  const strikes = { ...session.strikes, llmFailures: session.strikes.llmFailures + 1 }
  if (strikes.llmFailures >= 2 * LLM_FAIL_STRIKES) return { action: 'handoff', reason: 'vendor_error', strikes }
  if (strikes.llmFailures >= LLM_FAIL_STRIKES && session.provider === 'primary') {
    return { action: 'switch', provider: 'secondary', strikes }
  }
  return { action: 'retry', strikes }
}

// Conservative on purpose (Build Spec §5.3 "two abusive turns end the call"): only words with no
// innocent reading in a restaurant call, in English and in Hindi as it is spoken and as a
// recogniser writes it. A false positive hangs up on a paying customer; a false negative costs
// one more turn. Whole words only — "chutney" must not match.
const ABUSE_WORDS = [
  // English
  'fuck', 'fucking', 'fucker', 'motherfucker', 'bastard', 'bitch', 'asshole', 'arsehole',
  // Hindi, romanised
  'madarchod', 'maderchod', 'behenchod', 'bhenchod', 'benchod', 'bhosdike', 'bhosdi', 'bhosadike',
  'chutiya', 'chutiye', 'gaandu', 'gandu', 'harami', 'randi',
  // Hindi, Devanagari
  'मादरचोद', 'बहनचोद', 'भेनचोद', 'भोसड़ी', 'भोसड़ीके', 'चूतिया', 'चुतिया', 'गांडू', 'हरामी', 'रंडी',
]

// \b is ASCII-only, so the boundaries are spelt out: no letter or combining mark (a Devanagari
// matra) on either side. The longer Devanagari alternatives sit after the shorter ones and are
// reached by backtracking when the lookahead fails.
const ABUSE = new RegExp(`(?<![\\p{L}\\p{M}])(?:${ABUSE_WORDS.join('|')})(?![\\p{L}\\p{M}])`, 'iu')

export const isAbusive = (text: string): boolean => ABUSE.test(text)
