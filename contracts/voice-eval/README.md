# Voice evaluation set

Build Spec §16: "a scripted utterance set per language … Measures item recognition accuracy (the
item that ends up in the cart is the item spoken), intent accuracy, and turn latency. Runs against
staging on every voice change. Target item accuracy: 85% at M2, 92% at M3, 95% after vocabulary
tuning at M4."

```sh
npm run eval                 # every language, the configured provider
npm run eval -- --lang hi    # one language
npm run eval -- --limit 10   # the first n cases of each, for a quick check
npm run eval -- --gap 4000   # pause between cases, for a rate-limited key
```

## What this is not, yet

§16 wants these utterances **spoken by five people down a real phone line with kitchen noise
playing**. That measures the speech recogniser and the model together, and it is the number that
matters before a pilot. This set is the text half: it holds the model, the prompt and the tools to
account, and it will be the script those recordings read from. Until there is audio, a score here is
an upper bound — a recogniser that mishears "dosa" as "dosha" fails a case this set would pass.

## The shape of a case

```json
{
  "id": "hi-order-variant",
  "say": "ek aadha paneer butter masala",
  "why": "a half portion, named the way a caller says it",
  "intent": "order",
  "expect": { "items": [{ "name": "Paneer Butter Masala", "qty": 1, "variant": "Half" }] }
}
```

- `say` is one caller utterance, as spoken. Code-mixed where a caller would code-mix.
- `intent` is what the call should be classified as: `order`, `enquiry` or `other`.
- `expect.items` is what should be in the cart afterwards — names exactly as the menu spells them,
  with `variant` and `options` where the utterance names one. An empty list means nothing should be
  added, which is the correct outcome for an enquiry.
- `expect.tool` is the tool that must have been called and succeeded, for cases where the outcome is
  not a cart: `answer_enquiry`, `transfer_to_human`, `check_serviceability`, `apply_code`.

Every case runs as its own call against the seeded demo menu, so cases never interfere.

## Reading a result

`item` is the fraction of cart cases whose cart matched exactly — the §16 target. `intent` is the
fraction classified correctly. `errored` cases are ones where the model failed (a rate limit, an
outage) rather than answered wrongly; they are excluded from both, and a run with many of them is
not a measurement.

## Baseline

Gemini 3.5 Flash Lite (ADR 0006), 22 September 2026, 90 cases:

| | item accuracy | intent accuracy | p50 | p95 |
|---|---|---|---|---|
| English | 100% (17/17) | 96% (23/24) | 4.1 s | 5.3 s |
| Hindi | 100% (26/26) | 96% (25/26) | 4.2 s | 5.4 s |
| Kannada | 96% (23/24) | 100% (24/24) | 5.0 s | 7.7 s |

Against §16's targets — 85% at M2, 92% at M3 — with room. Three caveats, all of which matter more
than the number:

- **16 of 90 cases errored on a rate limit**, not on an answer, and are excluded. Roughly a fifth of
  the set did not run. A paid key would measure all of it.
- **This is text.** No recogniser, no phone line, no kitchen noise. The number that decides a pilot
  is this set read aloud by five people, and it will be lower.
- **The failures were worth more than the score.** Two were a real gap — a caller asking to cancel an
  order already placed had nowhere to go, and the prompt now sends them to a person. One was a bad
  test: the menu calls an item "Kerala Parotta (2 pcs)", so "two parotta" means pieces to a caller
  and orders to the menu, and the case now says "two plates".
