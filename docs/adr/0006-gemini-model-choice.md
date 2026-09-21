# ADR 0006 — Gemini 3.5 Flash Lite, chosen by measurement

Date: 21 September 2026
Status: Accepted
Amends: Build Spec §3 (LLM: "Start with Gemini 2.5 Flash")

## Context

Build Spec §3 names Gemini 2.5 Flash, with the requirement that first token arrive in under 500 ms,
and §5.4 budgets a whole turn — speech in, model, speech out — at 1.0 s p50 and 1.8 s p95.

With a key issued in September 2026, Gemini 2.5 Flash is gone: the API answers `404` with "This
model is no longer available to new users. Please update your code to use models/gemini-3.6-flash".
So the model had to be chosen again, and Google's recommendation was measured rather than taken.

Measured on this account on 21 September 2026 — one tool, a three-dish Hinglish order
("ek masala dosa aur do paneer butter masala full, aur ek filter coffee bada"), five runs each:

| Model | Thinking | Median | Worst | Failures |
|---|---|---|---|---|
| `gemini-3.5-flash-lite` | low | **1.19 s** | 1.57 s | 0/5 |
| `gemini-flash-lite-latest` | default | 1.07 s | 9.78 s | 0/5 |
| `gemini-3-flash-preview` | budget 0 | 1.82 s | 1.86 s | 0/5 |
| `gemini-3.6-flash` (Google's suggestion) | low | 29.9 s | — | 1/3 503 |
| `gemini-3.7-flash`, `3.8-flash`, `3.5-flash`, `flash-latest` | any | 5.7–120 s | — | mostly 503 |

Every model produced the correct three `search_menu` calls. The distinguishing fact is time: the
full Flash models were between six and twenty times over the budget for a single turn, or refused
service outright.

## Decision

`gemini-3.5-flash-lite` with `thinkingConfig: { thinkingLevel: 'low' }`, pinned, overridable by a
`GEMINI_MODEL` environment variable so the next retirement is a configuration change.

`flash-lite-latest` had a marginally better median but a 9.8 s outlier in five runs, and a floating
alias can change behaviour without a deploy. A 1.57 s worst case inside a 1.8 s budget is worth more
than 0.12 s off the median.

Thinking is set to `low` and not off: `thinkingBudget: 0` is rejected with a 400 by this model, and
`low` still reads a three-dish code-mixed order correctly.

## Consequences

The model is a tier below what §3 assumed, and on a harder call — an unusual dish name, a caller who
changes their mind twice — it may do worse than a full Flash model would. That is a real trade and
the cure is measurement, not a bigger model: the voice evaluation harness (Build Spec §16, seeded at
`contracts/voice-eval/`) is what should decide whether the lite tier holds, on real utterances, before
a pilot. Should it not hold, the choices are a full Flash model on an account whose quota does not
503, or a different vendor behind the same adapter.

Cost falls: lite pricing is roughly a third of the 2.5 Flash line behind Ideation §10's ₹8–20 per
call estimate, which therefore still holds with room to spare. **The lite tier's list price was not
reachable from here and is recorded in `src/voice/pricing.ts` as unverified — check it at kickoff.**

The 503s are worth watching: several models were unavailable rather than slow, which may be this
key's quota rather than the models. If a pilot key behaves differently, re-run the measurement —
the script is the table above, reproducible against `/v1beta/models`.
