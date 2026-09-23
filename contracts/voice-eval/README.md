# Voice evaluation set

Build Spec §16: "a scripted utterance set per language … Measures item recognition accuracy (the
item that ends up in the cart is the item spoken), intent accuracy, and turn latency. Runs against
staging on every voice change. Target item accuracy: 85% at M2, 92% at M3, 95% after vocabulary
tuning at M4."

```sh
npm run eval                            # every language, the configured provider
npm run eval -- --lang hi               # one language
npm run eval -- --limit 10              # the first n cases of each, for a quick check
npm run eval -- --gap 6000              # pause between cases, for a rate-limited key
npm run eval -- --cases kn-order-long   # named cases only, comma separated
```

A score from a `--cases` run covers that subset and is not comparable with a full run. A misspelled
id is reported rather than silently dropped, because a run that quietly scores fewer cases scores
higher.

When a case fails, the score alone cannot say whether the assistant misheard the caller or simply
ran out of tool rounds. `npm run trace` prints every tool call one utterance produces, in order,
with its arguments and what came back — which distinguishes the two immediately, and is how the
Kannada finding below was diagnosed.

```sh
npm run trace -- --case kn-order-long
npm run trace -- --say "ek masala dosa aur do chai" --lang hi
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

Gemini 3.5 Flash Lite (ADR 0006), 23 September 2026, 90 cases, after the prompt fix below:

| | item accuracy | intent accuracy | p50 | p95 | errored |
| --- | --- | --- | --- | --- | --- |
| English | 100% (20/20) | 100% (27/27) | 4.3 s | 6.5 s | 3 |
| Hindi | 100% (29/29) | 100% (29/29) | 4.9 s | 8.4 s | 1 |
| Kannada | 100% (30/30) | 100% (30/30) | 5.5 s | 9.4 s | 0 |

Zero genuine failures. Kannada ran its full thirty with no rate-limit errors at all, so that column
is a complete sample rather than a flattered one — which matters, because the previous run recorded
86% there over 22 scored cases.

**Read `errored` before you read the score.** Errored cases are excluded, so rate limiting does not
lower a result — it raises it, by quietly removing whichever cases happened to fail while the quota
was gone. A run with a double-digit `errored` column is an upper bound on an upper bound.

Caveats, in the order they matter:

- **This is text.** No recogniser, no phone line, no kitchen noise. Speech-to-text is not wired at
  all (ADR 0007), so the phone half of this has never run end to end. The number that decides a
  pilot is this set read aloud by five people, and it will be lower. 100% here does not mean the
  assistant hears Kannada; it means it reasons correctly about Kannada text.
- **Latency still misses Build Spec §5.4**, which budgets p50 1.0 s and p95 1.8 s a turn. Every
  language is four to five times that. The accuracy problem is closed; the latency one is not.
- **4 of 90 errored on a rate limit** even at `--gap 6000`. This is the free tier.

### What was wrong, and what fixed it

The three Kannada failures in the previous run were not recognition failures. `search_menu` matches
the menu as the restaurant wrote it, which is Latin script, and `menu_vocabulary` — the thing that
would let a Kannada query match — is M4. That limitation is known and documented at
`src/voice/tools.ts`.

The assistant had been compensating on its own: search `ಮಸಾಲ ದೋಸೆ`, get nothing, translate, search
`masala dosa`, then add. That works, and a trace of `kn-order-long` shows it recovering perfectly —
five empty searches, five successful ones, five correct adds. But the recovery costs a full tool
round out of the four a turn allows, and nothing in the prompt told the assistant which script the
menu was in, so it only translated first about half the time. The same case passed on one run and
failed on the next. That variance was the entire 86%.

Two prompt lines fixed it: the menu is Latin script whatever the caller speaks, and a multi-dish
order is searched all at once and added all at once rather than one at a time. Both are workarounds
for the M2 matcher and should be deleted when `menu_vocabulary` lands.

### A note on `kerala-parotta`, for whoever reads this next

The menu calls an item "Kerala Parotta (2 pcs)", so "two parotta" means pieces to a caller and
orders to the menu. A trace showed the assistant adding one plate — two pieces — which is a
defensible reading of the request, arguably the right one.

`kn-order-kurma-parotta` had already been reworded to "two **plates** of kerala parotta" after
failing for this reason. `hi-order-full-chicken-curry` had the identical phrasing and had not been,
so the set was asking the harder question in Hindi and the easier one in Kannada and the two scores
were not comparable on that item. It now says "2 plate kerala parotta" too.

Rewording a case so it passes deserves the scrutiny it sounds like it deserves. The justification is
that the utterance is genuinely ambiguous to a human as well, and that leaving one language on the
ambiguous phrasing measured the ambiguity rather than the assistant. **The ambiguity itself is still
open and is a product decision, not a test one:** either the assistant asks which the caller meant,
or menu items stop carrying quantities in their names.
