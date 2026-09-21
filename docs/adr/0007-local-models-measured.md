# ADR 0007 — Local models: measured, and what they are good for

Date: 22 September 2026
Status: Accepted
Context: Build Spec §3 (LLM, speech to text), §5.4 (latency budget)

## Context

The hosted brain is rate-limited on a free key and costs money on a paid one, and Sarvam — the Build
Spec's speech vendor — cannot be bought yet. A MacBook Pro (M2 Pro, 16 GB) can run all three pieces
of a voice assistant locally, so the question was whether it should.

Measured on that machine, 22 September 2026. Identical work in every case: the same three-turn Hindi
order through `src/voice/loop.ts` — *"ek masala dosa aur do filter coffee"*, then a read-back, then
the order — against the same fourteen tools and the same prompt.

## The brain

| Model | p50 per turn | p95 | Completed the flow? |
|---|---|---|---|
| Gemini 3.5 Flash Lite (hosted) | **2.9 s** | 6.7 s | yes — searches, adds, read-back, order |
| Qwen3 8B local, thinking off | 15.7 s | 24.6 s | searches and adds; never reached the order |
| Qwen3 14B local, thinking off | 33.8 s | 54.6 s | worse — missed the second dish |
| Qwen3 8B local, thinking on (default) | 53.4 s | 138.8 s | no |

Three things the numbers say.

**Thinking is most of the cost.** Qwen3 reasons before answering unless told not to: 53 s a turn
became 15.7 s with `think: false`. The adapter sets it, for the same reason Gemini runs at
`thinkingLevel: low` (ADR 0006) — a caller on a phone cannot wait for deliberation.

**Bigger is worse here.** 14B is twice as slow as 8B and *less* accurate on the task, dropping a dish
from a two-dish order. On 16 GB there is nothing above 14B to try, so "a stronger local model" is not
an available answer; the ceiling has been reached and it is below the requirement.

**The gap is not close.** 15.7 s against a §5.4 budget of 1.8 s is not a tuning problem. A turn is
two to four sequential model calls over a prompt of fourteen tool schemas, and prompt processing is
what a laptop is slow at.

## The speech

`whisper.cpp` with `large-v3-turbo` (q5_0, 547 MB), run as a persistent server:

| | Result |
|---|---|
| English, 3 s clip | *"1 masala dosa and 2 filter coffee please"* — exact, numerals normalised |
| Hindi, 3 s clip | *"एक मसाला डोस और दो फिल्टर कॉफी"* — correct but for one missing vowel |
| Warm inference | ~1.9 s per clip |
| Cold start | 22 s (model load; irrelevant to a server that stays up) |

This is the piece worth having. It is accurate on the two languages tested, it is the substitute for
the Sarvam dependency that cannot be bought yet, and it runs on the restaurant's own machine, which
is the strongest possible answer to the data-residency question in Build Spec §10.

Indic text-to-speech locally is the weak link and was not pursued: Piper's Hindi voices are below
Bulbul's and Kannada barely exists. The browser's own voices, which `/r/{slug}/call` already uses,
run on the device anyway.

## Decision

**The hosted model stays the brain.** `src/adapters/llm/ollama.ts` is kept — it is a working
provider selected by `LLM_PRIMARY_PROVIDER=ollama`, with `OLLAMA_MODEL` and `OLLAMA_HOST` — because
it costs nothing to keep, it is the offline demo when a network is not available, and this table is
worth being able to re-run on better hardware. It is not the default and should not be until a
measurement says otherwise.

**Whisper is the intended speech-to-text for M2b**, alongside or instead of Sarvam, and is not wired
yet: the browser's recogniser is what `/r/{slug}/call` uses, and replacing it is transport work that
belongs with the Exotel audio path.

## Consequences

Anyone proposing "just run it locally" now has the numbers, including the counter-intuitive one:
the larger local model is worse on both axes. Re-run the measurement before believing otherwise on
different hardware — an M4 Max with 64 GB is a different machine, and a 30B MoE would fit on it.

The reproduction is `src/voice/loop.ts` driven directly, three turns, with failovers discarded so a
mock answering in microseconds cannot flatter a result.
