# ServeLine

An AI-first ordering and customer-ownership platform for Indian SMB restaurants. Bangalore first.

A restaurant keeps its existing phone number, forwards it to an AI that takes orders in Hindi, English
and Kannada, and owns the resulting customer database outright. The aggregators acquire the customer;
ServeLine takes the relationship from order two onward.

## The documents

| File | What it is |
|---|---|
| `ServeLine — Ideation.md` | Canonical product thinking. Where the three documents disagree, this one wins. |
| `ServeLine — Build Spec.md` | How to build what Ideation decided. |
| `docs/adr/` | Every place this repository deliberately departs from the Build Spec, and why. |
| `docs/superpowers/specs/` | Design specs, one per milestone, agreed before implementation. |

## Current state

**M1 and M2 are complete and browser-verified.** The ordering page, the counter dashboard and the
agent console all work; so does the call assistant — fourteen tools, three languages, guardrails,
a per-call cost ledger, and a review screen that shows every tool call it made and what each one
returned.

Built in portfolio-first mode: every external vendor — payments, SMS, telephony, speech, LLM —
sits behind an adapter interface with a working mock. **No vendor account is needed to run any of
it end to end.** Swapping in live credentials is a configuration change, not a rewrite.

What is measured, and how:

| | |
|---|---|
| Item accuracy, 90 scripted utterances | 100% in English, Hindi and Kannada (`contracts/voice-eval/`) |
| Ordering page | Lighthouse mobile 99, against a floor of 85 (ADR 0003) |
| Tests | 377, `node:test`, no framework |

Read those numbers with the caveat the eval README states plainly: **it is text in, text out.** The
assistant reasons correctly about Kannada text; it has not yet been measured hearing Kannada down a
phone line with a kitchen behind it, which is the number that decides a pilot.

What is **not** built, stated here so the gap is not something you discover later: there is no
telephony leg and no text-to-speech adapter, so a real phone call does not work end to end yet —
the browser is the only transport. Menu digitisation (M4), the billing job and the metrics views
(M5) are unstarted. `docs/adr/` records every decision that took the repository away from the Build
Spec, including the ones that were wrong.

## Getting started

```sh
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

Then open http://localhost:3000. The seed loads a fictional Bangalore restaurant with a
three-language menu, a Direct Order Card batch and a discount code.

## Layout

```
app/          Next.js routes — the three surfaces and the API
  (customer)/   ordering page, /r/{slug}
  (restaurant)/ counter dashboard, /app
  (platform)/   internal agent console, /agent
  api/v1/       the API, shared by all three and by the voice transports
src/
  core/       domain logic with no framework imports — cart, order state, codes, consent
  db/         Drizzle schema, migrations, seed
  adapters/   payments, sms, storage, llm, stt — one interface and one mock each
  auth/       phone OTP and session cookies
  voice/      the call assistant: prompt, loop, tools, guardrails, cost ledger
  ui/         design tokens, shared components, and ShadCN primitives on a token bridge
contracts/    language-neutral files the Python voice service will also read
docs/         ADRs, reviews, design specs
graphify-out/ a knowledge graph of the whole repository — open graph.html
```

## Worth reading first

- `docs/design/steel-and-enamel.md` — the design language, and the reasoning behind each rule
- `docs/adr/0009-speech-to-text-adapter.md` — why speech runs on the restaurant's own machine
- `docs/reviews/2026-09-22-bug-hunt.md` — 24 confirmed defects with evidence, and 3 refuted
- `contracts/voice-eval/README.md` — what the accuracy numbers mean and what they do not
