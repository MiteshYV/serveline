# ADR 0004 — The voice assistant's brain lives in the API, in TypeScript

Date: 20 September 2026
Status: Accepted
Amends: Build Spec §3 (Voice orchestration), §15 (services/voice)

## Context

Build Spec §3 puts the whole voice pipeline — transport, speech recognition, the LLM with its
tools, speech synthesis — in a Python service on Pipecat, because the audio ecosystem is Python.
§5.6 then makes that service a client of the API: cart state, menu search and order placement are
API calls, and the API owns the session.

At M2 there is no telephone line and no speech vendor. What can be built and demonstrated is the
conversation: the prompt, the model, the thirteen tools, the guardrails and the ledger. All of it
depends on `src/core` and the repositories, which are TypeScript, and none of it touches audio.

## Decision

The brain — prompt assembly, the LLM loop, the tool handlers, guardrails, session state, cost — is
`src/voice/` in the Next.js application, exposed through `/api/v1/voice/*` exactly as §5.6 shapes it.
Two transports talk to it: the browser (speech recognition and voices in the page) now, and a
Python/Pipecat process (Exotel audio, Sarvam speech) when an Exotel number exists.

The tool JSON Schemas live in `contracts/voice-tools.json`, language-neutral, read by the TypeScript
handlers, the tests and the future Python transport.

## Consequences

Good: one runtime today; the assistant runs the same `priceCart`, the same `placeOrder`, the same
redemption and consent rules as the web page, by import rather than by HTTP; the whole conversation
is unit-testable with a mock model and a temporary database.

Bad: latency. Build Spec §5.4 budgets 400 ms to the model's first token; a transport-to-API hop
adds a few milliseconds on the same host and more across regions. Keep the transport in Mumbai next
to the app (Build Spec §3 already says so) and revisit only if measured.

Reversal: the Python service can absorb the loop later by importing the same tool contract and
calling the same tool endpoints. `src/voice` would then shrink to the tool handlers, which is where
the value is anyway.
