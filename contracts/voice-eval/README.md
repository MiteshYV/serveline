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

Gemini 3.5 Flash Lite (ADR 0006), 23 September 2026, 90 cases:

| | item accuracy | intent accuracy | p50 | p95 | errored |
|---|---|---|---|---|---|
| English | 100% (20/20) | 100% (26/26) | 4.3 s | 31.8 s | 4 |
| Hindi | 96% (23/24) | 100% (24/24) | 4.1 s | 10.4 s | 6 |
| Kannada | 86% (19/22) | 95% (21/22) | 4.6 s | 7.2 s | 8 |

**Kannada clears §16's M2 target of 85% by one point and misses M3's 92%.** The 22 September run
recorded 96% there; the difference is not a regression, it is that the earlier run excluded more
cases. Errored cases are dropped from the score, so rate limiting does not lower a result — it
raises it, by removing whichever cases happened to fail while the quota was gone. Treat any run
with a double-digit `errored` column as an upper bound on an upper bound.

Caveats, in the order they matter:

- **This is text.** No recogniser, no phone line, no kitchen noise. The number that decides a pilot
  is this set read aloud by five people, and it will be lower. Speech-to-text is not wired at all
  yet (ADR 0007), so the phone half of this has never run end to end.
- **18 of 90 errored on a rate limit** even at `--gap 5000`. A fifth of the set did not run. This is
  the free tier; a paid key would measure all of it.
- **p95 is not a latency measurement.** English's 31.8 s is a single case that hit a retry, not a
  turn a caller would wait through. p50 is the honest figure.

### The failures are one bug, not four

Every genuine failure in this run is the same shape: **everything after the first item is dropped.**

| case | spoken | got |
|---|---|---|
| `kn-order-long` | five items | four `search_menu` calls, **zero** `add_to_cart` |
| `kn-order-veg-biryani` | Veg Biryani + 2× Butter Naan | Veg Biryani only |
| `kn-order-curd-rice` | Curd Rice + Buttermilk | Curd Rice only |
| `hi-order-full-chicken-curry` | Chicken Curry + 2× Kerala Parotta | Parotta quantity 2 → 1 |

Three of the four are Kannada, which accounts for the entire gap to M3. `kn-order-long` is the
clearest: the assistant searched the menu four times and never committed anything to the cart.
This is one diagnosable problem and it is what M4's vocabulary tuning exists for — but it may also
be a loop problem rather than a grounding one, and that is cheaper to check first.

### A note on `kerala-parotta`, for whoever reads this next

The menu calls an item "Kerala Parotta (2 pcs)", so "two parotta" means pieces to a caller and
orders to the menu. `kn-order-kurma-parotta` was reworded to "two **plates** of kerala parotta"
after it failed, and it passes now.

`hi-order-full-chicken-curry` has the identical "2 kerala parotta" phrasing, was never reworded,
and fails every time it runs — three attempts out of three on 23 September. So the set currently
asks the harder question in Hindi and the easier one in Kannada, which makes the two languages'
scores not comparable on this item. Either reword both or neither; do not leave it split.
