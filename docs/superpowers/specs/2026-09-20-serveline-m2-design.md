# ServeLine M2 — design

> Agreed 20 September 2026. Covers Build Spec §14 milestone M2, the voice service, built without a
> telephone line or speech vendor. Product decisions are not made here; where this document and
> `ServeLine — Ideation.md` disagree, Ideation wins.

## Purpose

The AI call assistant is the wedge (Ideation §7): every restaurant is already being called and someone
is already answering badly. M2 builds the assistant's *brain* — the conversation, the tools, the
guardrails, the ledger — and two ways to talk to it that need no vendor account: a microphone on the
ordering page, and a text simulator in the agent console. The telephone transport (Exotel audio,
Sarvam speech) is a thin client of the same API and arrives when an Exotel number exists (ADR 0004).

The "same as last time?" shortcut is included although the Build Spec sequences it at M3: it is the
thirty-second call, the product's signature moment (Ideation §6), and it costs one tool once the brain
exists.

## Architecture

```
  app/(customer)/r/[slug]/call      mic button; browser speech recognition and voices; text in/out
  app/(platform)/agent/calls        call list, review (turns, tool calls, cost, tag), text simulator
        │
  app/api/v1/voice/*                the §5.6 contract: session-init · turn · tools/{name} · end
        │
  src/voice/                        the brain
    prompt.ts     assembles the system prompt from templates + outlet card + profile summary (§5.5)
    tools.ts      the thirteen tool handlers, thin over src/core and src/db/repos
    loop.ts       one turn: messages → LLM → tool calls → LLM → reply; guardrails; ledger
    session.ts    per-call state (cart, language, turn count, strikes); in memory, keyed by call id
        │
  src/adapters/llm/                 complete(messages, tools) — gemini.ts, anthropic.ts, mock.ts
  src/core, src/db/repos            the same pricing, state rules and repositories the web page uses
```

`src/voice` never imports `next`; it is called by the route handlers and by tests. The transport of the
future (Python/Pipecat) speaks to `/api/v1/voice/*` exactly as the browser does today; nothing in
`src/voice` knows which.

### The turn

1. The surface posts the caller's text (and, from the browser, the recogniser's confidence and
   language).
2. `loop.ts` appends it to the call's messages, runs the guardrails that act *before* the model
   (abuse strike, confidence gate, turn cap), and calls the LLM adapter with the tool schemas.
3. Every tool call the model returns is executed by `tools.ts` — never by the model's own text — and
   its result is appended; the model is called again until it answers in prose. At most four tool
   rounds per turn.
4. The reply, the tool calls and the token counts are written as a `call_turn`; the cost ledger
   accrues. The surface speaks or prints the reply.

Menu grounding is structural (Build Spec §5.3): `add_to_cart` accepts only ids that `search_menu`
returned in this session, and `priceCart` refuses anything else. The model cannot invent an item or a
price because it never supplies either — it supplies ids and quantities.

### The thirteen tools (Build Spec §5.5, verbatim)

`search_menu`, `add_to_cart`, `remove_from_cart`, `get_cart`, `apply_code`, `check_serviceability`,
`use_saved_address`, `capture_rough_address`, `send_sms`, `place_order`, `answer_enquiry`,
`transfer_to_human`, `end_call`. JSON Schemas in `contracts/voice-tools.json` — language-neutral, so
the Python transport and the tests read the same file.

`place_order` calls `src/checkout/place-order.ts`'s `placeOrder` with a new `call` context (channel
`ai_call`, the order linked to the call). Voice orders are `delivery` or `pickup`; a `pickup` context
is added to `placeOrder` for it.

### Prompt (Build Spec §5.5)

Assembled per call, never hand-edited per restaurant: persona and greeting rules; the languages
allowed and the rule to answer in the caller's language; operating policies; the outlet card; the
profile summary; the tool list. **No phone number and no full address ever enter the prompt** (Build
Spec §10): the profile summary carries first name, usual order, saved address *labels* and allergies.

### Guardrails (Build Spec §5.3, adapted to text)

| Spec rule | M2 form |
|---|---|
| Confidence gating (STT < 0.6 twice) | the browser recogniser's confidence; two low turns → re-ask once; a third → handoff `low_confidence` |
| Duration cap 6 min | a turn cap of 24 caller turns → transfer `cap` |
| Silence | n/a for text; the mic surface ends the call after 30 s without speech |
| Instruction resistance | prices, policy and tools are owned by the prompt and the handlers; the prompt says so |
| Abuse | two abusive turns end the call `abandoned` with `handoff_reason = abuse` |
| Outage | two LLM failures in a session → the secondary provider; two more → transfer `vendor_error` |

### Handoff without a telephone

`transfer_to_human` ends the session with "connecting you to the restaurant". If a cart exists, the
order is created `needs_attention` with the cart and the reason, which pins it on the counter board
(Ideation §8 flow 6) — the same behaviour a real transfer would produce. The counter completes or
cancels it by hand.

## Data

Build Spec §4's call tables, one migration: `call`, `call_turn`, `call_cost`, and `order.call_id`.

Two deliberate departures from §4, both recorded here:

- **`call.from_phone` is not created.** §4 lists it, but §15's own do-not list forbids a phone number
  anywhere except `customer`, `staff_user`, `platform_user` and `outlet`, and CLAUDE.md enforces that.
  `from_phone_hash` identifies the caller; the `customer` link carries the number when a human needs
  it.
- **`call.transport`** (`browser` | `exotel`) is added. Build Spec §12's completion rate is defined
  over real calls; demo calls from the browser must be separable from them or the metric lies on the
  day the first restaurant goes live.

`call_recording` waits for audio. `menu_vocabulary` is M4.

Session state — the cart, the search results seen, strikes — lives in memory keyed by call id, with a
`// ponytail:` note pointing at Redis, which Build Spec §3 wants and which arrives with the transport
that needs more than one process.

## Cost ledger

`call_cost` per call: tokens in and out from the adapter's usage report, priced by constants in
`src/voice/pricing.ts` (Gemini 2.5 Flash and Claude Haiku 4.5 list prices, dated, in paise per
million tokens, with a comment to re-check). STT, TTS and telephony columns stay zero in the browser
transport and are filled by the Sarvam/Exotel transport later. `/app/today`'s "AI calls used" reads
`counts_toward_allowance` (answered by AI and ≥ 10 s, Ideation §10 — for text, ≥ 2 caller turns).

## Surfaces

**Customer — `/r/{slug}/call`.** One large *Call* button. The browser's `SpeechRecognition` in the
page's language (`hi-IN`, `en-IN`, `kn-IN`); recognised text goes to the API; the reply is spoken with
`speechSynthesis` in the same language and shown as a transcript. Barge-in: speaking stops the voice.
Feature-detected; a browser without recognition gets a "type instead" fallback. Honest limit stated
on the page: Kannada voices depend on the device.

**Agent — `/agent/calls`.** The list (outlet, started, language, intent, outcome, cost), the review
screen (transcript with per-turn confidence, tool calls with arguments and results, cost breakdown,
a tag: misheard item / address / intent / vendor / other — stored on the call for M4's tuning loop),
and the **simulator**: pick an outlet and a caller phone (seeded customers appear as choices), type,
read. Every simulator call is a real call row with `transport = browser`.

## Adapters

`src/adapters/llm/`: `complete({ system, messages, tools }) → { text?, toolCalls[], usage }`.
Gemini via its documented REST API with `fetch`; Anthropic via the official `@anthropic-ai/sdk`
(Claude Haiku 4.5, the spec's second provider, with the SDK's typed tool-use loop); and a mock that
follows a scripted policy for tests and for a demo without a key. The primary and
secondary are `LLM_PRIMARY_PROVIDER` / `LLM_SECONDARY_PROVIDER`; failover is in `loop.ts`, not in the
adapters.

## Error handling

Caller-facing: every refusal a tool can produce (unknown item, unserviceable pincode, refused code)
comes back to the model as a structured result and the model explains it in the caller's language;
nothing throws across the tool boundary. Operator-facing: a handoff always produces a `needs_attention`
order if a cart exists, so nothing a caller said is lost. Programmer errors — an illegal transition, an
id not from this session — throw and end the call `failed`, logged with the call id only.

## Testing

Unit: prompt assembly (no phone or address in the output, ever — a test greps for digits), each tool
handler against a temp PGlite, the guardrail state machine, the pricing constants.

Scripted: `src/voice/loop.test.ts` drives the loop with the mock LLM through the acceptance
conversations below and asserts the tool calls and the resulting rows.

Eval seed (Build Spec §16): `contracts/voice-eval/` with thirty caller utterances per language (menu
items said the way people say them, quantities, variants, a code, an address, a handoff request) and
the expected tool calls; run against the mock now and against the real model when a key exists.

## Acceptance — done when

1. Text simulator: a three-item Hindi order with a variant is placed; it is on the dashboard within
   5 s; the payment link is in the mock SMS inbox.
2. "I want to talk to someone" ends the call with a handoff and pins a `needs_attention` order.
3. Mic surface: a spoken English order completes end to end in Chrome.
4. A returning customer (seeded, with `usual_order`) completes "same as last time" in ≤ 3 turns.
5. Every call has a `call` row, its `call_turn`s with tool calls, and a `call_cost` row.
6. With the primary key invalid, the secondary provider answers the next turn; with both invalid,
   the call transfers with `vendor_error`.

## Out of scope

Exotel and Sarvam transports and their tuning (M2b, when accounts exist); recordings; menu
vocabulary and post-STT correction (M4); enquiry deflection by SMS and the address-link flow (M3);
the six-minute wall-clock cap (needs audio).
