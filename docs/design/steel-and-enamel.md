# ServeLine Design Language — **Steel & Enamel**

Research / direction document. No application code, no scaffold, no repo.
Every colour pair in this file was computed, not estimated (WCAG 2.x relative luminance;
hue/chroma in OKLCH; perceptual distance as ΔE-OK). The verification script is described in
§13 so you can re-run it when values change.

**Status of inputs:** written from the brief alone — this thread had no interactive answer
channel, so the product record behind it (scratchpad `serveline-ctx/PRODUCT.md`) marks its
inferences `[INFERRED]`. The open ones are: stack, accessibility standard (assumed WCAG 2.2 AA),
and the exact purpose of the Monday nag (assumed: the pilot's core proof metric). Confirm those
three before this hardens.

Direction seed: `1e786dfc` · scope `direction` · mode `operate` · assigned index 3.

---

## 1. The direction

### **Steel & Enamel**

> The surface is a working steel counter. State arrives as flat enamel plates fixed to it.
> Steel is ServeLine's and never changes. Enamel belongs to the order, or to the restaurant.

The material world of an Indian restaurant counter is **stainless steel** — the counter itself, the
thali, the tiffin, the billing machine's housing, the shelf the phone is propped against. It is cool,
neutral, slightly blue-green under fluorescent light, and completely unsentimental. Onto that steel a
working kitchen fixes **vitreous enamel**: flat, saturated, gradient-free, high-contrast plates and
signage that survive grease, heat and twenty years of hands.

That gives the system its single governing rule, which resolves the hardest problem in the brief
(per-restaurant brand colour) as a side effect:

**Two layers. They never mix.**

| Layer | Owner | Where it appears | Never |
|---|---|---|---|
| **Steel** | ServeLine | every ground, panel, border, primary button, all text | carries meaning |
| **State enamel** | the order lifecycle | card edge, status plate, state glyph | decoration, or a page field |
| **House enamel** | the restaurant | customer header band, customer primary CTA, active tab, logo chip | the dashboard board, the agent console, any state channel |

Because state enamel and house enamel never occupy the same component, a restaurant whose brand
colour is *exactly* our "received" blue causes no collision. There is nothing to collide with.

**Three named consequences:**

1. **Colour is never a button.** The primary action is a filled `steel-900` plate with white text
   (16.16:1) everywhere except the customer surface, where the *restaurant's* colour takes it. On
   the counter dashboard, zero chroma competes with state. This is the most load-bearing decision
   here.
2. **Plates, not pills.** Status chips are 4px-radius rectangles, not 999px capsules. A rectangle
   holds a long Kannada string at the same height a capsule holds a short English one, and it reads
   as stamped hardware rather than a consumer app tag.
3. **Delivered returns to steel.** Terminal states are *drained*, not recoloured. A board of
   completed orders is grey and quiet. Only three states are permitted to be chromatically loud.

**Honest risk:** a cool steel-grey system can read as cold or unfinished to a restaurant owner
expecting something that "looks like an app." Mitigation is the enamel edge and the restaurant's own
colour in the header — the first thing the owner sees on their customer page is *their* colour, not
ours.

### Where the roll landed and what it beat

My grounded candidate list, ordered by resonance, drawn from artefacts this audience reads daily —
five material families, to avoid stopping at the category's most obvious object:

1. KOT / thermal kitchen ticket · 2. IRCTC reservation chart + station status board ·
**3. The stainless counter and its enamel signage** ← *assigned* · 4. Laminated menu card with FSSAI
marks · 5. UPI confirmation screen · 6. Municipal enamel signage / painted shutter ·
7. Engineering drawing of a kitchen layout.

Excluded before ranking as the category rut: **(a)** the aggregator page — orange chrome, food
photography carousels, promo ribbons; **(b)** its predictable opposite — the dark developer console
with hairline seams and one neon accent.

#### Rejected alternative 1 — **Kitchen Ticket** *(my own top-ranked candidate; rejected)*
Thermal 80mm receipt: mono figures, dashed rules, tear perforation, stamped status.
**Why not:** it is the single most obvious artefact of the category, and it renders as cream paper +
monospace — the exact default this kind of brief lands on. Worse, it is *literally* what the
aggregator's tablet prints, so it would make ServeLine look like aggregator plumbing rather than the
restaurant's own tool. Mono figures also hurt: proportional-width Devanagari and Kannada beside a
monospace Latin column is visually incoherent, and no monospace face on a cheap Android covers all
three scripts. **Kept from it:** tabular figures for every number, and the ticket's discipline that
one order = one bounded object with a hard edge.

#### Rejected alternative 2 — **Departure Board** *(verdict: competitive)*
The order board as a rail concourse split-flap: rows are live entities ranked by time, columns never
move, only their contents change.
**Why not:** it wins audience identification and loses product clarity. It is a one-surface idea —
the customer ordering page and the menu digitisation editor are not boards — and its entire motion
grammar (per-character cascade) is unaffordable on a cheap Android and banned outright on 3G.
**Kept from it — *fixed positions*:** the board never re-sorts on arrival. An order's position is
stable for its whole life, so the operator's eye learns where things are. New arrivals are announced
by a counter at the top, never by pushing the board around under a moving finger.

#### Rejected alternative 3 — **Dark Developer Console** *(verdict: competitive)*
Graphite ground, hairline seams instead of shadow, syntax-derived accents for state only,
destructive actions deliberately isolated.
**Why not:** it wins product clarity on the agent console and loses audience identification on the
two surfaces that matter more. A graphite console reads "not for me" to a diner and to a
fifty-five-year-old restaurant owner. It is also exactly the tool-monoculture default the direction
roll exists to refuse. **Kept from it — *seams, not shadows*, and *isolated destruction*:** panel
division is a 1px border, because soft shadows band visibly on cheap LCD panels and cost compositing
on a phone that is already thermally throttled. And "Cancel order" is never adjacent to "Mark ready."

#### Rejected alternative 4 — **Orienteering Legend** *(verdict: competitive)*
A fixed terrain colour language beneath; the numbered course rides above and never edits the terrain.
**Why not:** orienteering is not a literacy this audience has.
**Kept from it — *the course never edits the terrain*:** this is the two-layer rule above, and it is
the single cleanest answer to how a brand colour slots in safely. Also kept: the **legend
discipline** — every mark in the system is defined in one ranked table, which is exactly what a
trilingual, low-tech-comfort audience needs.

*Declined and not spent:* an arcade-pixel world (donated **palette law** — a hue is reserved for
exactly one meaning and may never appear as decoration) and a tensegrity-force world (donated
**flatten and pose** — on constrained devices, replace continuous motion with a two-state
before/after swap, never a slower version of the same animation).

**The standing door, offered without recommendation:** the category standard played straight — white
cards on light grey, a blue or teal primary, Inter, Material-style elevation, i.e. a
Toast/Square-for-Restaurants alike. If you want that, say so and it gets executed at full fidelity
rather than smuggled in halfway.

---

## 2. Reference products — what to take, what to refuse

| Product | Borrow | Refuse |
|---|---|---|
| **Toast POS** | The KDS order-card anatomy: one card = one order, a single dominant next-action, an always-visible elapsed timer. Their colour-coded ticket ageing is the right instinct. | Its density on a 10" tablet does not transfer to a 5.5" phone. Toast assumes fixed hardware; you cannot. Also refuse their chrome-heavy top nav — a phone at a counter has no room for it. |
| **Square for Restaurants** | Onboarding: Square is the best in the category at getting a non-technical owner from zero to first order. Steal the checklist-with-progress pattern for the agent console. Steal their plain-language error copy. | Their brand-forward consumer polish. Square wants you to know it is Square; ServeLine must recede so the restaurant shows. |
| **Lightspeed** | Menu/modifier data modelling — the hierarchy (item → variant → modifier group → modifier) is the right shape for the digitisation editor. | Its UI is genuinely cluttered: too many simultaneous affordances, low information scent. Treat it as an anti-reference for the agent console. |
| **Petpooja** | The most important reference here, because it is the incumbent your restaurants may already use, and it is Indian-market-native: GST-inclusive pricing, KOT flow, aggregator reconciliation, multi-language. Match its *feature literacy*. | Its visual density and control count are overwhelming for the counter phone. Do not match its look; match its understanding of the market. |
| **Linear** | Keyboard-first density, state machines expressed as first-class UI, restraint in colour, and genuinely fast perceived performance. The agent console should feel like this. | Do not ship its *appearance*. Indigo-on-graphite with glass panels is the rut named in §1, and it is wrong for both non-internal surfaces. |
| **Stripe Dashboard** | The gold standard for dense tabular data that stays readable: tabular figures, restrained row separators, generous vertical rhythm despite density. Also their error copy — specific, actionable, never blaming. | Its information architecture assumes an expert daily user with a big screen. The counter surface is the opposite of that. |
| **UPI apps (GPay / PhonePe / BHIM)** | *The* trust benchmark for Indian users on the customer surface: enormous amount numerals, one unambiguous confirmation mark, almost no chrome at the moment of truth. Model the order-confirmed screen on this directly. | Their brand colour saturation and their promo/rewards surfaces. |
| **Swiggy / Zomato** | Only one thing: their flow literacy. Indian diners already know cart → address → confirm. Do not re-teach it. | Everything visual. Named and enforced numerically in §3.4. |

---

## 3. Colour

### 3.1 Steel — the neutral ramp

Cool, low-chroma, blue-green-shifted. **Not** a pure grey (that is the digital default) and
emphatically **not** warm (cream is the rendition trap this brief invites and the system refuses).

| Token | Hex | OKLCH (L/C/H) | On `#FFFFFF` | Permitted use (light) |
|---|---|---|---|---|
| `--steel-000` | `#FFFFFF` | 1.000 / 0 / — | 1.00 | card ground |
| `--steel-025` | `#F6F8F9` | .977 / .003 / 229 | 1.07 | subtle row stripe |
| `--steel-050` | `#EDF1F3` | .953 / .006 / 229 | 1.14 | **app ground** |
| `--steel-100` | `#E1E7EA` | .924 / .008 / 229 | 1.25 | wash, disabled fill, track |
| `--steel-200` | `#CBD5DA` | .864 / .012 / 232 | 1.49 | **decorative separator only** |
| `--steel-300` | `#AAB8C0` | .770 / .019 / 234 | 2.03 | **non-semantic border only** |
| `--steel-400` | `#85949E` | .652 / .024 / 236 | **3.12** | **minimum control/input border (SC 1.4.11)**, disabled text |
| `--steel-500` | `#667681` | .545 / .027 / 238 | **4.69** | tertiary text, placeholder |
| `--steel-600` | `#4F5E68` | .458 / .026 / 238 | 6.70 | secondary text |
| `--steel-700` | `#3A474F` | .368 / .023 / 240 | 9.57 | icon default |
| `--steel-800` | `#28333A` | .284 / .021 / 241 | 12.92 | heading |
| `--steel-900` | `#192227` | .208 / .017 / 243 | 16.16 | **primary text, primary button fill** |
| `--steel-950` | `#0F171B` | .152 / .015 / 245 | 18.12 | **dark app ground** |

**Dark-mode roles do not mirror the light ramp.** This is the mistake every system makes. Measured
on the dark app ground `#0F171B`:

| Role | Light | Dark | Dark contrast |
|---|---|---|---|
| app ground | `--steel-050` | `--steel-950` | — |
| card / panel | `--steel-000` | `--steel-900` `#192227` | — |
| raised (sheet, menu) | `--steel-000` | `--steel-800` `#28333A` | — |
| primary text | `--steel-900` 16.16 | `--steel-100` `#E1E7EA` | **14.52** |
| secondary text | `--steel-600` 6.70 | `--steel-300` `#AAB8C0` | **8.91** |
| tertiary text | `--steel-500` 4.69 | `--steel-400` `#85949E` | **5.81** |
| control border | `--steel-400` 3.12 | `--steel-500` `#667681` | **3.44** |
| separator | `--steel-200` | `--steel-700` `#3A474F` | 1.69 (decorative) |

Note the asymmetry: `--steel-500` is a legal body colour on light (4.69) but **fails** on dark (3.86).
Do not pair ramp steps by number.

### 3.2 State enamel — reserved by law

Six states. **Only three are allowed to be chromatically loud** (received, ready, needs-attention).
`preparing` is mid-weight brass. `delivered` and `cancelled` are drained to steel — a board of
finished work must not glow.

Each state has four tokens with fixed jobs:
- **`ink`** — text, icons, and the card's 4px state edge. Always ≥4.5:1 on both card and app ground.
- **`plate`** — the filled chip background. Its `on` colour is always ≥4.5:1.
- **`on`** — text on `plate`.
- **`wash`** — a tint ground for grouped rows / expanded detail.

**LIGHT** (card `#FFFFFF`, app `#EDF1F3`)

| State | `ink` | ink/card | ink/app | `plate` | `on` | on/plate | `wash` | ink/wash |
|---|---|---|---|---|---|---|---|---|
| received | `#0B5FA5` | 6.57 | 5.78 | `#0E6FBE` | `#FFFFFF` | 5.20 | `#E4F0FA` | 5.68 |
| preparing | `#6E5208` | 7.31 | 6.43 | `#8A6508` | `#FFFFFF` | 5.32 | `#F7EFDB` | 6.38 |
| ready | `#10704A` | 6.11 | 5.37 | `#128054` | `#FFFFFF` | 4.95 | `#E1F4EC` | 5.34 |
| delivered | `#4F5E68` | 6.70 | 5.90 | `#E1E7EA` | `#28333A` | 10.35 | `#EDF1F3` | 5.90 |
| needs-attention | `#8F0E35` | 9.20 | 8.10 | `#A11240` | `#FFFFFF` | 7.85 | `#FCE7EC` | 7.79 |
| cancelled | `#5C6770` | 5.79 | 5.09 | `#E1E7EA` | `#28333A` | 10.35 | `#EDF1F3` | 5.09 |

**DARK** (card `#192227`, app `#0F171B`, raised `#28333A`)

| State | `ink` | ink/card | ink/app | ink/raised | `plate` | `on` | on/plate | `wash` |
|---|---|---|---|---|---|---|---|---|
| received | `#6FB8F5` | 7.58 | 8.50 | 6.06 | `#12557F` | `#FFFFFF` | 7.98 | `#10273A` |
| preparing | `#E8B857` | 8.79 | 9.86 | 7.03 | `#5E3C07` | `#FFFFFF` | 9.88 | `#2E2109` |
| ready | `#4FC894` | 7.71 | 8.65 | 6.17 | `#0C5738` | `#FFFFFF` | 8.62 | `#0D2E22` |
| delivered | `#AAB8C0` | 7.95 | 8.91 | 6.36 | `#3A474F` | `#FFFFFF` | 9.57 | `#1C262C` |
| needs-attention | `#FF9FB0` | 8.34 | 9.35 | 6.67 | `#8E0F2B` | `#FFFFFF` | 9.32 | `#33101C` |
| cancelled | `#99A4AD` | 6.36 | 7.14 | 5.09 | `#28333A` | `#E1E7EA` | 10.35 | `#1C262C` |

Every pair above passes AA at 4.5:1. **Zero failures across 24 measured pairs.**

**Palette law (donated from a declined challenger).** These six hues are reserved. They may not
appear as decoration, illustration, chart fill, marketing accent, or hover tint anywhere in the
product. If you need another colour for something that is not an order state, you may not have one —
use steel.

### 3.3 Never colour alone (SC 1.4.1)

Every state carries **three** redundant encodings: the **edge** (position + colour), a **glyph**
(shape), and a **text label** (translated). The glyph set is deliberately script-neutral and
ordinal — the first three are a 3-segment progress bar, so the sequence is legible even in
monochrome and even to a viewer who reads none of the three languages:

| State | Glyph | Shape description |
|---|---|---|
| received | `▮▯▯` | 3 segments, 1 filled |
| preparing | `▮▮▯` | 3 segments, 2 filled |
| ready | `▮▮▮` | 3 segments, all filled |
| delivered | `✓` | check |
| needs-attention | `!` in triangle | triangle |
| cancelled | `✕` | cross |

Ship these as inline SVG (~80 bytes each), not an icon font and not an emoji.

### 3.4 Anti-aggregator, verified numerically

The two colours that could read as aggregator chrome are the amber and the red. Both were moved
until the arithmetic cleared. Perceptual distance in OKLab (ΔE-OK; >0.10 is a clearly different
colour):

| Ours | vs Swiggy `#FC8019` | vs Zomato `#E23744` | vs Zomato alt `#CB202D` |
|---|---|---|---|
| preparing plate `#8A6508` | **0.223** | 0.193 | 0.173 |
| preparing ink `#6E5208` | **0.296** | 0.235 | 0.197 |
| needs-attention plate `#A11240` | 0.296 | 0.152 | **0.099** |
| needs-attention ink `#8F0E35` | 0.329 | 0.191 | **0.135** |

`preparing` was moved from a mid-orange to **brass** — hue 82.7° vs Swiggy's 52.1°, a 30.6°
separation, and 0.20 darker in L. Brass is also materially correct: steel + brass + enamel is the
actual hardware palette of an Indian commercial kitchen.

`needs-attention` was moved to a deep **oxblood** — L 0.460 against Zomato's 0.543, chroma 0.174
against 0.203. Be honest: the plate is ΔE-OK **0.099** from Zomato's darker red, marginally under
the 0.10 threshold. Two mitigations make it safe, and both are rules, not hopes:
1. The darker `ink` (ΔE 0.135) carries the large majority of usage — every card edge, every icon,
   every piece of red text.
2. **Red is never a field.** It appears only as a ≤32px chip, a 4px edge, and a glyph. Never a
   header, never a page background, never a filled primary button outside a confirm dialog. An
   aggregator read requires red at *field* scale; this system forbids that scale.

### 3.5 The restaurant brand colour — a normalizer, not a variable

Never inject a raw brand hex into the UI. Run it through a deterministic normalizer at
onboarding-save time, store the derived tokens, and ship those. The algorithm:

```
input: raw brand hex → OKLCH(L₀, C₀, H)

brand-fill   : C = min(C₀, 0.16); start L = 0.55, step L down by 0.01
               until contrast(white, fill) ≥ 4.5  → brand-on = white
               if no L ≥ 0.30 works (very yellow/lime hues):
                 start L = 0.86, step up until contrast(steel-900, fill) ≥ 4.5
                 → brand-on = steel-900
brand-ink    : C = min(C₀, 0.14); start L = 0.52, step down
               until contrast(ink, #FFFFFF) ≥ 4.5 AND contrast(ink, #F6F8F9) ≥ 4.5
brand-wash   : L = 0.965, C = min(C₀, 0.035)
brand-fill-d : C = min(C₀, 0.13); start L = 0.46, step down until white ≥ 4.5
brand-ink-d  : C = min(C₀, 0.12); start L = 0.72, step UP
               until ≥ 4.5 on #0F171B AND #192227 AND #28333A
brand-wash-d : L = 0.24, C = min(C₀, 0.05)

after each candidate: clip chroma into sRGB gamut (reduce C by 0.005 until in gamut)
```

Hue is **always preserved**. Only lightness and chroma are constrained — so the restaurant still
recognises its colour.

Tested against twelve hostile inputs. **Zero AA failures:**

| Raw input | `brand-fill` (light) | `brand-on` | `brand-ink` | on/fill | ink/white |
|---|---|---|---|---|---|
| neon lime `#B6FF00` | `#5A8009` | white | `#527601` | 4.64 | 5.32 |
| near-black maroon `#2B0A0F` | `#8F6568` | white | `#865C5F` | 4.97 | 5.66 |
| bright yellow `#FFD600` | `#86700A` | white | `#7C6705` | 4.84 | 5.53 |
| mid blue `#1E5AA8` | `#3671C1` | white | `#2D68B7` | 4.90 | 5.56 |
| hot pink `#FF2D8E` | `#B73F6E` | white | `#A63F66` | 5.32 | 5.96 |
| pure white `#FFFFFF` | `#717171` | white | `#696969` | 4.88 | 5.49 |
| pure black `#000000` | `#717171` | white | `#696969` | 4.88 | 5.49 |
| muddy olive `#6B6B2E` | `#757539` | white | `#6D6D30` | 4.82 | 5.41 |
| saffron `#FF9933` | `#A55D0B` | white | `#9A5504` | 5.04 | 5.71 |
| india green `#138808` | `#2B8724` | white | `#2F7C29` | 4.57 | 5.20 |
| cyan `#00E5FF` | `#14808E` | white | `#007785` | 4.66 | 5.28 |
| deep purple `#4A148C` | `#604597`* | white | `#7254AF` | 5.21 | 5.83 |

\* dark-mode fill shown for purple; light fill `#7C58C2`.

Note that pure white and pure black both normalise to a neutral grey. That is correct and
intentional: an achromatic brand has no hue to preserve, so it becomes steel. Do not "fix" this.

**Where brand colour may appear — the complete list. It is short on purpose.**

| Surface | Permitted | Forbidden |
|---|---|---|
| Customer `/r/{slug}` | header band (`brand-fill`), primary CTA (`brand-fill` + `brand-on`), active category tab underline (`brand-ink`, 3px), selected-row wash (`brand-wash`), logo chip | status chips (always the outline variant here), prices, body text, any error or state surface |
| Restaurant dashboard | a 4px identity rail at the top edge, and the wordmark | **everything else.** The board is a state instrument. |
| Agent console | a swatch preview inside the brand-config field only | everything else |

Fallback when no brand colour is configured: `--brand-fill: var(--steel-900)`, `--brand-ink: var(--steel-800)`,
`--brand-wash: var(--steel-050)`. The page must be complete and handsome with no brand at all — that
is the day-one state of every restaurant.

**The one place brand and state co-occur** is the customer's order-status page (brand header + status
chip). Rule: **the customer surface always uses the outline chip variant**, so the brand's filled
plate is the only filled colour plate on the page. No hue-collision logic needed.

---

## 4. Typography

### 4.1 The stack, and an honest accounting of why there is no webfont

```css
--font-ui:
  system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
  "Noto Sans", "Noto Sans Devanagari", "Noto Sans Kannada",
  "Nirmala UI", "Kohinoor Devanagari", "Kannada Sangam MN",
  Arial, sans-serif;

--font-numeric:
  Roboto, system-ui, -apple-system, "Segoe UI", "Helvetica Neue", Arial, sans-serif;

--font-mono:
  ui-monospace, "Roboto Mono", SFMono-Regular, Menlo, Consolas, monospace;
```

**Order rationale.** CSS font matching is *per character*, not per string. The Latin UI faces sit
first so Latin picks up the platform's own UI face; Devanagari and Kannada characters fall through
to the first listed family that covers them. `Nirmala UI` catches Windows (the agent console);
`Kohinoor Devanagari` / `Kannada Sangam MN` catch macOS; `Noto Sans Devanagari` / `Noto Sans Kannada`
catch Android and Linux, where they are part of the AOSP/Noto system set and therefore already on the
device. On the target handsets, all three scripts render with **zero font bytes downloaded.**

**The budget arithmetic — this is why.** Approximate WOFF2 weights for one Regular weight (measure
your own build; these are order-of-magnitude):

| | approx. WOFF2 |
|---|---|
| Latin UI face, Regular + Bold | 30–50 KB |
| Noto Sans Devanagari, Regular | 85–110 KB |
| Noto Sans Kannada, Regular | 60–90 KB |
| **one weight, three scripts** | **≈ 175–250 KB** |

That is **1.75×–2.5× the entire JS budget, in fonts alone, for a single weight.** Add Bold and it
roughly doubles.

Subsetting does not rescue it. It works for Latin because the character set is bounded and
predictable. It fails for Devanagari and Kannada because the text is **unbounded user content** — a
restaurant adds a dish tomorrow containing a conjunct you did not subset, and it renders as tofu or
silently reflows. To be safe you must ship the whole script block, which is exactly where the weight
is.

On a Lighthouse-throttled mobile connection, ~200 KB of font is roughly 1 s of pure transfer at the
1.6 Mbps preset and ~4 s at classic 3G rates — competing directly with the LCP budget that the >85
score depends on. And `font-display: swap` is not free here: fallback and webfont metrics differ far
more across scripts than within Latin, so the swap produces a visible, multi-line reflow in the
middle of a menu.

**Decision: zero webfonts, product-wide — including the agent console.** Not "for now." One less
asset to version, one less thing to break, and all three surfaces stay visually identical. Two
consequences, stated plainly:

- **ServeLine's identity does not live in a typeface.** It cannot afford to. The identity is the
  steel ramp, the enamel edge, the plate geometry and the neutral primary button.
- **Accept the cross-script mismatch.** Roboto (Latin) and Noto Sans Devanagari are close cousins and
  sit together well; Noto Sans Kannada has a visibly different colour and weight. This is a real
  aesthetic cost and the right trade. Do not attempt to paper over it with `font-synthesis` or
  per-script `size-adjust` hacks — those introduce their own artefacts.

The **only** exceptions: the ServeLine wordmark ships as inline SVG (~1 KB), and each restaurant's
logo is an image asset.

### 4.2 Four rules that will otherwise bite you

1. **Weights 400 and 700 only, for any string that can be Indic.** On low-end and older Android, the
   system Devanagari and Kannada faces commonly ship Regular and Bold only; 500/600 get synthesised
   or snapped, so a "medium" label is Regular on one device and Bold on the next. Reserve 500/600
   strictly for Latin-only content — numerals, order IDs, currency.
2. **No `letter-spacing` on anything that can be Indic.** It visually breaks conjuncts and interrupts
   the Devanagari shirorekha. Tracking is permitted only on Latin-only micro-labels, capped at
   `0.02em`.
3. **No `text-transform: uppercase` on user content.** It is a no-op for Devanagari and Kannada, so a
   mixed string comes out half-shouting. Permitted only on hard-coded Latin system labels.
4. **Never combine a tight line-height with `overflow: hidden` or a fixed height on Indic text.**
   Devanagari matras sit above the shirorekha and Kannada has tall ascenders plus below-base forms;
   at 1.2 they are clipped. Floor is `1.45` for any element that can hold user content. Use
   `-webkit-line-clamp` with `line-height ≥ 1.45`, never a pixel `max-height`.

Line heights: `--lh-tight: 1.30` (Latin-only numerals and IDs), `--lh-ui: 1.45` (all labels and
anything translatable), `--lh-body: 1.60` (prose, notes, transcripts).

**Numerals.** Prices and order numbers must not inherit a Devanagari fallback's proportional figures.
Force them: `font-family: var(--font-numeric); font-variant-numeric: tabular-nums;`. Indian users
overwhelmingly read Western Arabic digits even in Hindi and Kannada text, so this is correct
linguistically as well as typographically. Format money with `Intl.NumberFormat('en-IN')` for lakh
grouping (₹1,23,456) — the browser does this at zero bytes.

### 4.3 The scale

Fixed rem, not fluid (operate mode; users are at consistent DPI, and a clamped heading that shrinks
inside a panel looks worse, not better). Root = 16px.

| Token | px | rem |
|---|---|---|
| `--fs-micro` | 11 | 0.6875 |
| `--fs-caption` | 12 | 0.75 |
| `--fs-small` | 13 | 0.8125 |
| `--fs-base-s` | 14 | 0.875 |
| `--fs-base` | 16 | 1 |
| `--fs-base-l` | 18 | 1.125 |
| `--fs-title-s` | 20 | 1.25 |
| `--fs-title` | 24 | 1.5 |
| `--fs-title-l` | 28 | 1.75 |
| `--fs-display-s` | 34 | 2.125 |
| `--fs-display` | 42 | 2.625 |
| `--fs-display-l` | 56 | 3.5 |

### 4.4 Three density modes, one scale

Set `data-density` on `<html>`. Role tokens remap; the scale never changes.

| Role | `comfort` (customer) | `counter` (dashboard) | `dense` (agent) |
|---|---|---|---|
| `--text-display` | 28 | **34** | 20 |
| `--text-title` | 20 | **24** | 18 |
| `--text-subtitle` | 18 | **20** | 16 |
| `--text-body` | **16** | **18** | **14** |
| `--text-label` | 14 | **16** | 13 |
| `--text-caption` | 13 | **14** | 12 |
| `--text-micro` | — | — | 11 |

**Counter floor: nothing below 14px, ever — including timestamps.** See §6.

### 4.5 The two-layer sizing model on the counter

This is the core typographic idea of the dashboard, and it comes straight from the physics in §6.

- **Scan layer** — sized for ~65 cm, the propped-phone glance distance. Order number 34/700,
  state label 16/700, table or token number 24/700, elapsed timer 20/600 tabular.
- **Lean-in layer** — sized for ~40 cm, when the operator actually picks the phone up or leans
  toward it. Item lines 17/400, notes 15/400, address 15/400.

Never mix the layers within a row. A 14px item name sitting beside a 34px order number reads as
noise at arm's length; put it on its own line.

---

## 5. Space, radius, elevation, border

### 5.1 Spacing — 4px base, named by value

Self-documenting, no lookup table:

`--space-2: 2px` · `--space-4: 4px` · `--space-6: 6px` · `--space-8: 8px` · `--space-12: 12px` ·
`--space-16: 16px` · `--space-20: 20px` · `--space-24: 24px` · `--space-32: 32px` ·
`--space-40: 40px` · `--space-48: 48px` · `--space-64: 64px`

Gutters: customer 16px · counter 12px (wider cards matter more than wider margins) · agent 20px.

### 5.2 Radius — plates, not pills

| Token | px | Use |
|---|---|---|
| `--radius-1` | 2 | inner elements, swatches, the state edge's outer clip |
| `--radius-2` | 4 | **status chips**, tags, quick-pick chips |
| `--radius-3` | 6 | buttons, inputs, steppers |
| `--radius-4` | 8 | **cards**, panels |
| `--radius-5` | 12 | bottom sheets, modals |
| `--radius-full` | 999px | **avatar and numeric count badge only** |

`--radius-full` on anything else is a bug. See §11.

### 5.3 Elevation — seams in dark, hard shadows in light

Soft, wide shadows band visibly on cheap LCD panels and cost compositing on a thermally throttled
phone. Light mode uses tight, hard shadows; **dark mode uses border steps and no shadow at all.**

```
LIGHT
--elev-0  none                                         flat on ground
--elev-1  0 1px 1px rgba(15,23,27,.04),
          0 0 0 1px rgba(15,23,27,.06)                 cards, order cards
--elev-2  0 1px 2px rgba(15,23,27,.10),
          0 2px 8px rgba(15,23,27,.08)                 dropdowns, sheets, popovers
--elev-3  0 8px 24px rgba(15,23,27,.16),
          0 2px 6px rgba(15,23,27,.10)                 modal only

DARK
--elev-0  none
--elev-1  0 0 0 1px #3A474F
--elev-2  0 0 0 1px #3A474F, 0 2px 8px rgba(0,0,0,.50)
--elev-3  0 0 0 1px #4F5E68, 0 12px 32px rgba(0,0,0,.65)
```

**Signature bevel (light only):** `--bevel: inset 0 1px 0 rgba(255,255,255,.7)` on the primary button
and the order card's top edge. One pixel of brushed-steel highlight. It is the whole steel reference
and it costs nothing.

**Hard rule: the customer surface uses `--elev-0` and `--elev-1` only.** No card shadows. Sheets are
the sole exception and they get `--elev-2`.

### 5.4 Border treatment

The system is drawn with hairlines, not shadows.

- Default separator: `1px solid var(--steel-200)` light / `var(--steel-700)` dark. Decorative; no
  contrast requirement.
- **Control and input border: `--steel-400` light (3.12:1) / `--steel-500` dark (3.44:1).** This is
  the floor for SC 1.4.11. Using `--steel-300` (2.03:1) on an input is the most common failure in
  systems like this one — do not.
- **The signature: a 4px state edge on the left of every order card**, full height, using
  `--state-*-ink` (never `plate`, so it clears 3:1 in both modes by a wide margin — measured 5.09–9.35).
  This is the enamel plate fixed to steel. It is also the shape-not-colour-alone answer, and it is
  the only thing on the card that survives a 65 cm glance.
- List rows separate with a border on the child, not a gap. On the counter, cards separate with an
  8px gap on the app ground, because a gap survives a greasy screen better than a hairline does.

---

## 6. Touch targets and counter-phone ergonomics

### 6.1 Minimums

| Context | Minimum | Preferred | Gap between targets |
|---|---|---|---|
| Customer mobile | 44 × 44 | 48 × 48 | 8px |
| **Counter dashboard** | **56 × 56** | **64px row height** | **12px; 16px if either is destructive** |
| Agent console (mouse) | 32 × 32 | 36 × 36 | 8px |

WCAG 2.2 SC 2.5.8 (AA) requires 24×24. Every number here clears it substantially, deliberately.

### 6.2 Why the counter is different — the physics

The dashboard is not "a mobile app." It is a fixed instrument in a hostile physical setting, and four
specific conditions drive the numbers:

1. **Distance.** A held phone sits at ~33 cm; a propped phone at ~65 cm. To match the angular size of
   16px at 33 cm you need ~31px at 65 cm. Hence the scan/lean-in split in §4.5 — the *decision* layer
   is sized for 65 cm, the *detail* layer for a lean-in.
2. **The phone is propped, not held.** It has no counter-force. A tap near the top corners requires a
   reach that levers the device and topples it. Therefore: **primary actions live in the lower two
   thirds of the screen, full-width or near-full-width bars, never in a top corner.** Destructive and
   rarely-used actions may live in the top corners precisely *because* they are harder to hit.
3. **Greasy or wet fingers.** The contact patch is larger and less precise, and capacitive sensing
   degrades with moisture — a wet finger can register offset from its visual centre or not register
   at all. Hence 56px minimum and 12px gaps, and hence: **no swipe gestures for state changes, and no
   long-press anywhere.** Both fail unpredictably with moisture and have no visible affordance. Every
   state change is a labelled button.
4. **Divided attention.** The operator is mid-conversation, handling cash, calling to the kitchen.
   They glance, decide, tap, and look away. Therefore **one primary action per card**, always — the
   state machine determines the single next transition (received → *Accept*; preparing → *Mark ready*;
   ready → *Mark delivered*). The operator confirms; they never choose. Everything else lives behind a
   56×56 `⋯` at the card's right edge.

### 6.3 Two more counter rules

- **Isolate destruction** (donated from the developer-console challenger). "Cancel order" is never
  adjacent to the primary action, never in the card's action bar, and always behind the `⋯` menu with
  a one-step confirm. Minimum 16px from any other target.
- **Never re-sort the board under a moving finger** (donated from the departure-board challenger).
  Position is stable for an order's whole life. New arrivals are announced by a counter at the top of
  the viewport, not by pushing rows around. Sort groups: *pinned (address pending)* → *needs-attention*
  → *active, oldest first* → *done*. Within a group, insertion order only.

---

## 7. Component specs

### 7.1 Order card — the centrepiece (counter density)

```
┌─┬──────────────────────────────────────────────┐
│ │  #1284                   ▮▯▯ NEW     04:12    │   ← scan layer
│E│  TABLE 7                                      │
│D│  3 items · ₹640                               │   ← lean-in layer
│G│  ─────────────────────────────────────────    │
│E│  [        Accept order        ] [ ⋯ ]         │   ← one primary action
└─┴──────────────────────────────────────────────┘
```

- Width: full bleed − 12px gutters. `min-height: 104px`, height auto.
- Edge: 4px, full height, `--state-{x}-ink`, clipped by the card's 8px radius.
- Padding: 12px all round, 16px from the edge.
- **Row 1 (scan):** order number `#1284` at 34/700 tabular · status chip right-aligned · elapsed
  timer 20/600 tabular, far right. The timer counts **up** from receipt and is never hidden.
- **Row 2 (scan):** channel + locator. `TABLE 7` or `DELIVERY · 2.4 km`, 16/700, `0.02em` tracking
  (Latin-only label, so tracking is legal here).
- **Row 3 (lean-in):** `3 items · ₹640`, 17/500 tabular. Tapping the row expands the item list
  inline — **not** a navigation, not a modal.
- **Action bar:** one 56px-tall primary button, `--steel-900` fill, white text, `--bevel`, spanning
  the card width minus the 56×56 `⋯`.
- `needs-attention`: attention edge + a 32px band above the action bar carrying the reason in plain
  language ("Customer has not answered 2 calls"), `--state-attention-wash` ground,
  `--state-attention-ink` text. Card sorts into the attention group.
- `address-pending` (delivery): pinned above everything with a `PINNED` micro-label; the primary
  action becomes **"Get address"**, opening a `tel:` or WhatsApp intent. It stays pinned until an
  address exists — no auto-dismiss, no timeout.
- `delivered` / `cancelled`: drained edge, no action bar, collapsed to 64px, moved to a "Done" group
  that is collapsed by default.

**States to build:** default · expanded · needs-attention · pinned · updating (optimistic, see §8) ·
failed-to-sync · delivered · cancelled. Ship all eight.

### 7.2 Status chip / plate

- Rectangle, `--radius-2` (4px). **Not a pill.**
- Height: 24 (dense) / 28 (comfort) / 32 (counter). Horizontal padding 8px (10px at counter).
- Content: glyph (§3.3) + 6px gap + label. Label 700 weight, no `text-transform`, no tracking
  (labels are translated).
- **Two variants:**
  - **filled** — `plate` background, `on` text. Counter dashboard only.
  - **outline** — 1px `ink` border, `wash` fill, `ink` text. **Customer surface (always) and dense
    tables.**
- The chip's label is the *state*, never the action. "READY", not "Mark ready".

### 7.3 Menu item row (customer)

- `min-height: 72px`, 16px vertical padding, 16px gutters, 1px `--steel-200` bottom border.
- **FSSAI mark, 14×14, leading.** Legally-recognised and instantly parsed by every Indian diner.
  Veg: 1.5px square border + 7px dot, `#128054` (4.95:1 on white; dark `#4FC894`, 7.71:1).
  Non-veg: 1.5px square border + triangle, `#7A3B12` (8.53:1; dark `#D18A5A`, 5.77:1). Draw as
  inline SVG; add `<title>` for screen readers.
- Title 16/600 · description 14/400 `--steel-500`, clamped to 2 lines with `line-height: 1.45` ·
  price 16/600 tabular, right-aligned.
- Trailing control: an outline **ADD** button (min 44×44 hit area, `--brand-ink` text and border) —
  which swaps in place for the stepper once qty > 0. The swap must not change row height.
- **Images are off by default.** Food photography is the aggregator's device and the heaviest asset
  on the page. If a restaurant supplies them: 64×64, `loading="lazy" decoding="async"`, wrapped in an
  `aspect-ratio` box so there is zero CLS, and **at most two above the fold**.
- Out of stock: title → `--steel-500`, price struck through, a `Not available today` outline chip.
  **No opacity.** Reducing opacity silently destroys the contrast ratios computed in §3.

### 7.4 Cart

- **A persistent bottom bar, not a page**, until checkout. 64px + `env(safe-area-inset-bottom)`.
  `--steel-900` ground, white text. Left: `3 items · ₹640` tabular. Right: `View cart →`. The whole
  bar is one tap target.
- The menu list must reserve room:
  `padding-bottom: calc(64px + env(safe-area-inset-bottom) + var(--space-16))`. Otherwise the bar
  eats the last row — the single most common bug in this pattern.
- **The QR-vs-link split is decided at load from the URL, never asked.**
  Dine-in (table known from the QR): the terminal action is **"Send to kitchen"** — no address step,
  no delivery fee, table number shown as confirmation.
  Delivery link: the terminal action is **"Continue to address"**.
  Asking a seated diner for a delivery address is the clearest possible signal that you built one
  generic flow and did not think about them.
- Checkout is at most three steps: *items* → *phone/OTP* → *confirm*. Each step is a full screen with
  a visible step indicator, not an accordion.
- Empty cart: do not render the bar at all. No "0 items" bar.

### 7.5 Phone input

- Fixed, non-editable `+91` prefix in a visually separate 56px segment with a 1px right divider.
  Never a country dropdown — this is a single-market product.
- `<input type="tel" inputmode="numeric" autocomplete="tel-national" maxlength="10" pattern="[0-9]{10}">`
- **Never `type="number"`.** It brings spinners, mutates on scroll-wheel, and strips leading zeros.
- Validation: `/^[6-9]\d{9}$/` — Indian mobile numbers begin 6–9. Validate on blur and on submit,
  **never on keystroke**.
- 56px tall, 18px text, tabular figures, `--radius-3`, `--steel-400` border.
- Font-size must be ≥16px to stop mobile browsers zooming the viewport on focus.

### 7.6 OTP input

**One input. Not six boxes.** Six separate boxes break `autocomplete="one-time-code"`, break paste,
break Android SMS autofill, and read as six unlabelled fields to a screen reader. On a low-end
device with a low-tech-comfort user this is a real failure, not a preference.

```html
<input type="text" inputmode="numeric" autocomplete="one-time-code"
       maxlength="6" pattern="[0-9]{6}" aria-describedby="otp-help">
```

- 56px tall, 24px tabular text, `letter-spacing: 0.4em`, `text-align: center`. (Tracking is legal
  here: the content is Latin digits only.)
- Use the **WebOTP API** (`navigator.credentials.get({ otp: { transport: ['sms'] } })`) with a
  correctly formatted SMS — on Android this fills the field with no typing at all, which is the
  single biggest usability win available on this screen.
- Resend: a text button, disabled with a live countdown (`Resend in 0:24`), enabled at zero.
- **An error never clears the field.** Show the message below, keep the digits, select-all so a
  retype overwrites.
- Never auto-submit on the 6th character without a visible "Verifying…" state — silent submission on
  a mistyped digit is disorienting.

### 7.7 Quantity stepper

- `[ − ] [ 4 ] [ + ]`. Heights: 44 (customer) / 56 (counter).
- The number field is `min-width: 44px`, tabular figures, so 9 → 10 does not shift the row.
- **At qty 1, the minus becomes a remove (trash) glyph**, `aria-label="Remove {item}"`. A disabled
  minus strands the user with no way back out.
- **Tap the number to type a quantity.** No long-press-to-repeat: long-press is unreliable on low-end
  hardware, collides with text selection, and has no visible affordance.
- At the max (e.g. 20), show an inline message — never a silently disabled button.
- `aria-live="polite"` on the number so the new quantity is announced.

### 7.8 The Monday aggregator-count nag

The most delicate surface in the product. It interrupts a working operator to ask for a number that
benefits *you*. Design it honestly or it gets dismissed forever in week two.

```
┌────────────────────────────────────────────────┐
│▌ How many orders came through Swiggy or        │
│▌ Zomato last week?                             │
│▌ We track this to show you how much of your    │
│▌ business has moved to direct ordering.        │
│▌                                               │
│▌ [ 0 ] [ 1–10 ] [ 11–25 ] [ 26–50 ] [ 50+ ]    │
│▌ or enter exact:  [        ]                   │
│▌                                               │
│▌ [ Save ]        Skip this week            [×] │
└────────────────────────────────────────────────┘
```

**Rules, all of them load-bearing:**

- **Ground `--steel-050`, left edge 4px `--steel-400` — a neutral edge, never a state colour.** This
  is not an order state and must not borrow the vocabulary of one (palette law, §3.2).
- **Never a modal. Never a toast. Never over the board.** It sits below the header, above the board,
  in normal flow, and the board is fully usable with it open.
- **Quick-pick chips first, exact field second.** A range is a far easier question for a
  low-tech-comfort user on a phone than an empty numeric field, and the range is enough for the
  metric.
- **"Skip this week" is a real, equally legible text button** beside Save — not greyed, not tiny, not
  hidden. Making the decline path hard is a dark pattern, and here it would also poison the data.
- The `×` is a genuine 44px target.
- **Never during a rush.** If ≥3 orders sit in received or preparing, defer to the next dashboard
  open. Interrupting a rush to ask a marketing question is how you get uninstalled.
- Frequency: once per week, Monday, first dashboard open. After three consecutive skips, go quiet for
  four weeks. After answering, remove it from the DOM for the week — not `display:none`.
- After 20 seconds with no interaction it collapses to a one-line strip
  (`Weekly aggregator count →`) that can be reopened. It declares its own exit: it never vanishes
  without the operator knowing why.

### 7.9 Empty states

Three distinct kinds. Do not use one component for all three.

| Kind | Surface | Content |
|---|---|---|
| **First-run** (teach) | dashboard, no orders ever | "Your order board is ready. When a customer orders from your page, it appears here." + a **Preview my page** button + the QR to print. Teaches the interface. |
| **All-done** (quiet celebration) | dashboard, no *active* orders | "All caught up. 14 orders today." Steel, small, calm. No illustration, no confetti. A busy operator sees this ten times a day. |
| **Zero-result** (adjust) | agent console filters, menu search | "No restaurants match 'Koramangala' in Onboarding." + a **Clear filters** button. Names the query and the filter, and offers the escape. |

Customer menu with no items: never show an empty menu. Show `This restaurant is not taking orders
right now` plus the restaurant's phone number as a `tel:` link. A blank menu is a dead end; a phone
number is not.

**Never** ship "Nothing here." A restaurant owner reading that on day one thinks the product is
broken.

### 7.10 Error states

Ordered by likelihood on this product:

1. **Offline / request failed (most common on 3G).** A persistent 40px band at the top:
   `--state-attention-wash` ground, `--state-attention-ink` text, `No connection. Retrying…`, plus a
   **Retry now** text button. It must **never** be a toast — a toast that auto-dismisses on a flaky
   connection is worse than nothing. The band disappears on reconnect with a 160ms opacity fade.
2. **Action failed (e.g. "Accept order" did not reach the server).** Optimistic UI applies the state
   change immediately; on failure the card reverts, gains the attention edge, and shows
   `Could not accept. Tap to try again.` inline in the action bar. The operator's tap is never
   silently lost.
3. **Validation.** Inline, below the field, `--state-attention-ink`, 14px, with
   `aria-describedby` wired to the input and `aria-invalid="true"`. Triggered on blur and submit,
   never on keystroke. **The field keeps its value, always.**
4. **Payment failed (customer).** Full screen, following the UPI confirmation vocabulary in reverse:
   large glyph, one sentence of what happened, the amount, and two actions — **Try again** and
   **Pay at the counter**. Never strand a diner with a failed payment and no fallback.

Copy rules: name what happened, name what to do next, never blame the user, never show an error code
to a diner or an operator (log it; show it only in the agent console).

---

## 8. Motion

```
--dur-1: 100ms   state feedback: press, check, chip change
--dur-2: 160ms   default: hover, tooltip, band dismiss
--dur-3: 220ms   bottom sheet, dropdown, panel
--dur-4: 300ms   modal, full-screen step (maximum in the system)

--ease-out:   cubic-bezier(0.2, 0, 0, 1)      entering
--ease-in:    cubic-bezier(0.4, 0, 1, 1)      exiting
--ease-inout: cubic-bezier(0.4, 0, 0.2, 1)    moving within
--ease-snap:  cubic-bezier(0.3, 0, 0.1, 1)    press feedback
```

Nothing exceeds 300ms. Users are in a task.

### What must NOT animate on the customer surface or the counter phone

Non-negotiable on a low-end Android over 3G. Animate **`transform` and `opacity` only.**

- ❌ `width`, `height`, `top`, `left`, `margin`, `padding` — layout-triggering, guaranteed jank
- ❌ `box-shadow`, `filter`, `backdrop-filter` — repaint per frame; `backdrop-filter` is brutal on
  low-end GPUs and is the single worst offender
- ❌ skeleton shimmer — an infinite animation on a battery-powered device propped at a counter all
  day. **Use a static `--steel-100` block instead.** It reads as loading perfectly well.
- ❌ list reorder / FLIP transitions — and §6.3 forbids re-sorting anyway
- ❌ page transitions, scroll-linked animation, parallax, `mix-blend-mode`, animated gradients
- ❌ more than **2** concurrently animating elements
- ❌ any `animation-iteration-count: infinite`, with the single exception below

### The new-order alert — the one hard motion problem

A loud kitchen, a propped phone, a glancing operator. Motion alone will not do it, and an infinite
pulse is the wrong answer: it drains battery and the eye habituates to it within a day.

**Spec:**
1. **Sound first** — a short, distinctive two-tone chime. This is what actually works in a loud room.
   It must be user-testable for volume and disableable, and it requires a user gesture to unlock
   audio on the first load (put that in onboarding: "Tap to enable order sounds").
2. A **persistent, static high-contrast band** at the top: `--state-received-plate` ground, white
   text, `2 new orders`. It does not pulse. It stays until acknowledged, and it says so.
3. **Exactly 3 attention cycles, then still.** `animation-iteration-count: 3` on a
   `transform: scale(1 → 1.015)` / opacity pulse, 600ms each — 1.8 s total, then the band settles and
   never moves again. Three cycles catch a glance; infinity trains the eye to ignore it.
4. A count, not a re-sort. The board does not move.
5. Under `prefers-reduced-motion: reduce`, the pulse does not run at all. The band, the count and the
   sound are unchanged — **the alert never depends on motion for its meaning.**

### Reduced motion

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

Then restore intent selectively: opacity-only cross-fades at ≤100ms are permitted, transforms are
not. Apply the **flatten-and-pose** discipline: replace a continuous animation with a two-state
before/after swap, never with a slower version of the same animation.

---

## 9. Accessibility floor

**Target: WCAG 2.2 AA.** (Assumed — confirm; no standard was named in the brief.)

**Contrast.** All text ≥ 4.5:1; large text (≥24px, or ≥18.66px bold) ≥ 3:1; UI component boundaries
and state indicators ≥ 3:1 (SC 1.4.11). Every pair in §3 is measured and passes. The two that are
easy to get wrong and are therefore specified explicitly: input borders use `--steel-400` (3.12) in
light and `--steel-500` (3.44) in dark; card state edges always use `--state-*-ink` (5.09–9.35),
never `plate`.

**Focus ring — brand-independent by necessity.** The ring can land on top of a restaurant's arbitrary
brand colour, so it cannot itself be a colour. Use a dual-tone ring; one of the two always contrasts:

```css
:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--focus-inner), 0 0 0 4px var(--focus-outer);
  border-radius: inherit;
}
/* light: inner #FFFFFF, outer #192227 — on a mid-blue brand fill: 4.9 and 3.3 */
/* dark:  inner #0F171B, outer #E1E7EA */
```

Verified against a normalised mid-blue brand fill `#3671C1`: inner 4.9:1, outer 3.3:1 — both clear
3:1. Never remove the ring; never rely on `:focus` without `:focus-visible`; and satisfy SC 2.4.11
(Focus Not Obscured) by ensuring the sticky cart bar and the alert band never overlap a focused
element — add `scroll-margin-block` to focusable content.

**Screen readers.**

- The order board is a **list of articles** (`<ul>` / `<li>` / `<article>`), **not a table.** A table
  forces cell-by-cell reading; an operator using TalkBack needs one order announced as one unit.
- Two live regions, distinct: `aria-live="assertive"` for new-order arrival ("2 new orders") and
  `aria-live="polite"` for state changes ("Order 1284 marked ready"). Never put assertive on
  anything else — one assertive region only, product-wide.
- Every state is **in text**, not only in the edge colour or the glyph. The chip's label is real text.
- `lang` on any element whose content differs in language from the page — a Hindi dish name inside an
  English page is `<span lang="hi">`. This fixes screen-reader pronunciation and hyphenation, and it
  is free.
- `<html lang>` follows the selected language; the language switcher is a real `<select>`, labelled,
  and never a flag icon (a flag is a country, not a language — especially wrong for Hindi/Kannada).
- FSSAI marks and all state glyphs are SVG with `<title>`, or carry `aria-label`.
- Currency: mark up as text, not an image; `₹640` reads correctly, a sprite does not.

**Other.**

- `prefers-contrast: more` → borders step to `--steel-500` (light) / `--steel-400` (dark); all chips
  switch to the filled variant.
- Target size (SC 2.5.8, 24×24 minimum) is cleared everywhere by a wide margin (§6.1).
- Zoom to 200% without horizontal scroll (SC 1.4.10) — which the fixed rem scale plus a single-column
  mobile layout gives for free.
- Never convey information by colour alone (SC 1.4.1) — enforced by the three-encoding rule in §3.3.
- Every input has a persistent visible `<label>`. **Placeholders are not labels**, and a
  placeholder-only field is unusable for a low-tech-comfort user who taps in and loses the prompt.
- Do not disable zoom. `maximum-scale=1` / `user-scalable=no` is banned.

---

## 10. Performance notes that are design decisions

These belong here because they constrain the visual system, not just the build.

- **Zero webfonts** (§4.1) — ~175–250 KB and all font-swap CLS removed at a stroke.
- **Images off by default** on the menu (§7.3) — the heaviest asset class, and the aggregator's device.
- **No shadows on the customer surface** (§5.3) — avoids per-frame repaint and LCD banding.
- **Static loading blocks instead of shimmer** (§8) — no infinite animation on a battery device.
- **Inline SVG glyphs, no icon font** — ~80 bytes each versus a blocking font request.
- **Outline chips on the customer surface** — fewer filled areas, less paint, and it reserves the
  filled plate for the brand's CTA.
- Ship the normalised brand tokens as a small inline `<style>` block in the document head, keyed by
  slug. Do not compute OKLCH in the client — that is JS budget spent on arithmetic you can do once at
  onboarding-save time.
- Budget allocation to hold <100 KB JS: routing and hydration ≤ 30 KB, cart state ≤ 15 KB, form and
  validation ≤ 10 KB, analytics ≤ 5 KB, remainder as headroom. If a dependency costs more than the
  cart, it does not ship.

---

## 11. Anti-patterns — do not do this

Specific to ServeLine. Each has a reason, not a preference.

1. **Do not use orange or red as a field colour.** Chips, edges and glyphs only. Red at field scale
   is what makes a restaurant tool look like an aggregator, and it is the one visual mistake the
   brand position cannot survive.
2. **Do not let a restaurant's raw brand hex reach the DOM.** Always the normalised tokens (§3.5).
   One neon-yellow restaurant with white CTA text destroys the accessibility claim product-wide.
3. **Do not use a state colour for anything that is not an order state.** Not the Monday nag, not a
   promo, not a chart series, not a hover tint. Palette law.
4. **Do not put more than one primary action on an order card.** The operator confirms; they never
   choose. Two buttons at a counter means a wrong tap during a rush.
5. **Do not re-sort the board when an order arrives.** A finger is already moving toward a target.
   Announce with a counter instead.
6. **Do not use swipe gestures or long-press for state changes.** They fail with wet fingers, have no
   visible affordance, and cannot be taught to a low-tech-comfort user.
7. **Do not ask a seated diner for a delivery address.** The QR knows the table. Branch on the URL at
   load.
8. **Do not use six-box OTP inputs.** They break autofill, paste, and screen readers (§7.6).
9. **Do not use `type="number"` for phone, OTP, or quantity.** Spinners, scroll-wheel mutation,
   leading-zero loss.
10. **Do not use opacity to indicate unavailable.** It silently destroys every contrast ratio in §3.
    Change the colour token instead.
11. **Do not clamp Indic text with a pixel `max-height` or a line-height below 1.45.** Matras and
    below-base forms get clipped (§4.2).
12. **Do not use weight 500 or 600 on translatable strings.** They snap unpredictably on low-end
    Android system Indic faces.
13. **Do not use `--radius-full` on chips, buttons or cards.** Pills are the consumer-marketplace tell
    and they waste horizontal space that long Kannada strings need. Plates, not pills.
14. **Do not ship a skeleton shimmer.** Static block (§8).
15. **Do not use a toast for an error that has a retry.** It auto-dismisses on exactly the flaky
    connection where the user needed it. Use a persistent band.
16. **Do not make "Skip this week" hard to find on the Monday nag.** It is a dark pattern and it
    poisons the metric you are collecting.
17. **Do not show the Monday nag during a rush** (≥3 active orders).
18. **Do not add food photography carousels, promo ribbons, "X people ordered this", countdown
    timers, or urgency badges.** Every one is aggregator marketplace grammar. ServeLine is the
    restaurant's own tool; a restaurant does not upsell itself on its own menu.
19. **Do not use a flag icon for the language switcher.** A flag is a country, not a language.
20. **Do not reach for a modal.** On the counter it blocks the board — the one thing that must never
    be blocked. Exhaust inline and progressive alternatives first; the only permitted modals are
    destructive confirms.
21. **Do not let ServeLine's own branding compete on the customer page.** A small footer credit, and
    nothing else. The diner is in the restaurant's shop, not in ours.

---

## 12. Tokens — copy-pasteable CSS

```css
/* ==========================================================================
   ServeLine — Steel & Enamel
   Light is the default. Dark applies at [data-theme="dark"] and under
   prefers-color-scheme: dark unless [data-theme="light"] is set.
   ========================================================================== */

:root {
  color-scheme: light dark;

  /* ---- Steel: neutral ramp ------------------------------------------- */
  --steel-000: #FFFFFF;
  --steel-025: #F6F8F9;
  --steel-050: #EDF1F3;
  --steel-100: #E1E7EA;
  --steel-200: #CBD5DA;
  --steel-300: #AAB8C0;
  --steel-400: #85949E;
  --steel-500: #667681;
  --steel-600: #4F5E68;
  --steel-700: #3A474F;
  --steel-800: #28333A;
  --steel-900: #192227;
  --steel-950: #0F171B;

  /* ---- Semantic surfaces & text -------------------------------------- */
  --bg-app:        var(--steel-050);
  --bg-card:       var(--steel-000);
  --bg-raised:     var(--steel-000);
  --bg-sunken:     var(--steel-100);
  --bg-inverse:    var(--steel-900);

  --text-primary:   var(--steel-900);   /* 16.16:1 on card */
  --text-secondary: var(--steel-600);   /*  6.70:1 */
  --text-tertiary:  var(--steel-500);   /*  4.69:1 */
  --text-inverse:   var(--steel-000);
  --text-disabled:  var(--steel-400);   /* SC 1.4.3 exempts disabled */

  --border-separator: var(--steel-200); /* decorative only */
  --border-subtle:    var(--steel-300); /* non-semantic only */
  --border-control:   var(--steel-400); /* 3.12:1 — SC 1.4.11 floor */
  --border-strong:    var(--steel-500);

  /* ---- Action: colour is never a button ------------------------------ */
  --action-fill:       var(--steel-900);
  --action-on:         var(--steel-000);   /* 16.16:1 */
  --action-fill-hover: var(--steel-800);
  --action-ghost-ink:  var(--steel-800);

  /* ---- State enamel: reserved by law --------------------------------- */
  --state-received-ink:    #0B5FA5;  /* 6.57 card / 5.78 app */
  --state-received-plate:  #0E6FBE;
  --state-received-on:     #FFFFFF;  /* 5.20 on plate */
  --state-received-wash:   #E4F0FA;

  --state-preparing-ink:   #6E5208;  /* 7.31 / 6.43  — brass, ΔEok 0.30 from Swiggy */
  --state-preparing-plate: #8A6508;
  --state-preparing-on:    #FFFFFF;  /* 5.32 */
  --state-preparing-wash:  #F7EFDB;

  --state-ready-ink:       #10704A;  /* 6.11 / 5.37 */
  --state-ready-plate:     #128054;
  --state-ready-on:        #FFFFFF;  /* 4.95 */
  --state-ready-wash:      #E1F4EC;

  --state-delivered-ink:   #4F5E68;  /* 6.70 / 5.90 — drained to steel */
  --state-delivered-plate: #E1E7EA;
  --state-delivered-on:    #28333A;  /* 10.35 */
  --state-delivered-wash:  #EDF1F3;

  --state-attention-ink:   #8F0E35;  /* 9.20 / 8.10 — oxblood, not Zomato red */
  --state-attention-plate: #A11240;
  --state-attention-on:    #FFFFFF;  /* 7.85 */
  --state-attention-wash:  #FCE7EC;

  --state-cancelled-ink:   #5C6770;  /* 5.79 / 5.09 */
  --state-cancelled-plate: #E1E7EA;
  --state-cancelled-on:    #28333A;  /* 10.35 */
  --state-cancelled-wash:  #EDF1F3;

  /* ---- FSSAI marks (regulated, not decorative) ----------------------- */
  --fssai-veg:    #128054;  /* 4.95 on card */
  --fssai-nonveg: #7A3B12;  /* 8.53 on card */

  /* ---- Brand: normalised at onboarding, never raw -------------------- */
  /* Fallback = steel. Overridden per restaurant by an inline block. */
  --brand-fill: var(--steel-900);
  --brand-on:   var(--steel-000);
  --brand-ink:  var(--steel-800);
  --brand-wash: var(--steel-050);
  --brand-edge: var(--brand-ink);

  /* ---- Focus: brand-independent dual-tone ---------------------------- */
  --focus-inner: #FFFFFF;
  --focus-outer: #192227;

  /* ---- Type ----------------------------------------------------------- */
  --font-ui:
    system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
    "Noto Sans", "Noto Sans Devanagari", "Noto Sans Kannada",
    "Nirmala UI", "Kohinoor Devanagari", "Kannada Sangam MN",
    Arial, sans-serif;
  --font-numeric:
    Roboto, system-ui, -apple-system, "Segoe UI", "Helvetica Neue", Arial, sans-serif;
  --font-mono:
    ui-monospace, "Roboto Mono", SFMono-Regular, Menlo, Consolas, monospace;

  --fs-micro:     0.6875rem; /* 11 */
  --fs-caption:   0.75rem;   /* 12 */
  --fs-small:     0.8125rem; /* 13 */
  --fs-base-s:    0.875rem;  /* 14 */
  --fs-base:      1rem;      /* 16 */
  --fs-base-l:    1.125rem;  /* 18 */
  --fs-title-s:   1.25rem;   /* 20 */
  --fs-title:     1.5rem;    /* 24 */
  --fs-title-l:   1.75rem;   /* 28 */
  --fs-display-s: 2.125rem;  /* 34 */
  --fs-display:   2.625rem;  /* 42 */
  --fs-display-l: 3.5rem;    /* 56 */

  --fw-regular: 400;
  --fw-medium:  500;  /* Latin-only content */
  --fw-semi:    600;  /* Latin-only content */
  --fw-bold:    700;

  --lh-tight: 1.30;   /* Latin-only numerals and IDs */
  --lh-ui:    1.45;   /* anything translatable — hard floor */
  --lh-body:  1.60;

  /* Density defaults = comfort (customer). See [data-density] below. */
  --text-display:  var(--fs-title-l);   /* 28 */
  --text-title:    var(--fs-title-s);   /* 20 */
  --text-subtitle: var(--fs-base-l);    /* 18 */
  --text-body:     var(--fs-base);      /* 16 */
  --text-label:    var(--fs-base-s);    /* 14 */
  --text-caption:  var(--fs-small);     /* 13 */

  /* ---- Space ---------------------------------------------------------- */
  --space-2: 2px;   --space-4: 4px;   --space-6: 6px;   --space-8: 8px;
  --space-12: 12px; --space-16: 16px; --space-20: 20px; --space-24: 24px;
  --space-32: 32px; --space-40: 40px; --space-48: 48px; --space-64: 64px;

  /* ---- Radius: plates, not pills -------------------------------------- */
  --radius-1: 2px;
  --radius-2: 4px;   /* status chips */
  --radius-3: 6px;   /* buttons, inputs */
  --radius-4: 8px;   /* cards */
  --radius-5: 12px;  /* sheets, modals */
  --radius-full: 999px; /* avatar + count badge ONLY */

  /* ---- Elevation ------------------------------------------------------ */
  --elev-0: none;
  --elev-1: 0 1px 1px rgba(15,23,27,.04), 0 0 0 1px rgba(15,23,27,.06);
  --elev-2: 0 1px 2px rgba(15,23,27,.10), 0 2px 8px rgba(15,23,27,.08);
  --elev-3: 0 8px 24px rgba(15,23,27,.16), 0 2px 6px rgba(15,23,27,.10);
  --bevel:  inset 0 1px 0 rgba(255,255,255,.7);

  /* ---- Touch targets -------------------------------------------------- */
  --touch-min:     44px;  /* customer */
  --touch-counter: 56px;  /* dashboard */
  --touch-dense:   32px;  /* agent console, mouse */
  --row-counter:   64px;

  /* ---- Motion --------------------------------------------------------- */
  --dur-1: 100ms;
  --dur-2: 160ms;
  --dur-3: 220ms;
  --dur-4: 300ms;
  --ease-out:   cubic-bezier(0.2, 0, 0, 1);
  --ease-in:    cubic-bezier(0.4, 0, 1, 1);
  --ease-inout: cubic-bezier(0.4, 0, 0.2, 1);
  --ease-snap:  cubic-bezier(0.3, 0, 0.1, 1);
}

/* ==========================================================================
   DARK — roles are re-pointed, not mirrored. Do not pair by ramp number.
   ========================================================================== */

:root[data-theme="dark"] {
  --bg-app:    var(--steel-950);
  --bg-card:   var(--steel-900);
  --bg-raised: var(--steel-800);
  --bg-sunken: #0A1014;
  --bg-inverse: var(--steel-025);

  --text-primary:   var(--steel-100);  /* 14.52:1 on app */
  --text-secondary: var(--steel-300);  /*  8.91:1 */
  --text-tertiary:  var(--steel-400);  /*  5.81:1 */
  --text-inverse:   var(--steel-950);
  --text-disabled:  var(--steel-600);

  --border-separator: var(--steel-700);
  --border-subtle:    var(--steel-600);
  --border-control:   var(--steel-500); /* 3.44:1 */
  --border-strong:    var(--steel-400);

  --action-fill:       var(--steel-025);
  --action-on:         var(--steel-950); /* 17.01:1 */
  --action-fill-hover: var(--steel-100);
  --action-ghost-ink:  var(--steel-200);

  --state-received-ink:    #6FB8F5;  /* 7.58 card / 8.50 app / 6.06 raised */
  --state-received-plate:  #12557F;
  --state-received-on:     #FFFFFF;  /* 7.98 */
  --state-received-wash:   #10273A;

  --state-preparing-ink:   #E8B857;  /* 8.79 / 9.86 / 7.03 */
  --state-preparing-plate: #5E3C07;
  --state-preparing-on:    #FFFFFF;  /* 9.88 */
  --state-preparing-wash:  #2E2109;

  --state-ready-ink:       #4FC894;  /* 7.71 / 8.65 / 6.17 */
  --state-ready-plate:     #0C5738;
  --state-ready-on:        #FFFFFF;  /* 8.62 */
  --state-ready-wash:      #0D2E22;

  --state-delivered-ink:   #AAB8C0;  /* 7.95 / 8.91 / 6.36 */
  --state-delivered-plate: #3A474F;
  --state-delivered-on:    #FFFFFF;  /* 9.57 */
  --state-delivered-wash:  #1C262C;

  --state-attention-ink:   #FF9FB0;  /* 8.34 / 9.35 / 6.67 */
  --state-attention-plate: #8E0F2B;
  --state-attention-on:    #FFFFFF;  /* 9.32 */
  --state-attention-wash:  #33101C;

  --state-cancelled-ink:   #99A4AD;  /* 6.36 / 7.14 / 5.09 */
  --state-cancelled-plate: #28333A;
  --state-cancelled-on:    #E1E7EA;  /* 10.35 */
  --state-cancelled-wash:  #1C262C;

  --fssai-veg:    #4FC894;  /* 7.71 on card */
  --fssai-nonveg: #D18A5A;  /* 5.77 on card */

  --brand-fill: var(--steel-025);
  --brand-on:   var(--steel-950);
  --brand-ink:  var(--steel-200);
  --brand-wash: var(--steel-800);

  --focus-inner: #0F171B;
  --focus-outer: #E1E7EA;

  /* Seams, not shadows. */
  --elev-1: 0 0 0 1px #3A474F;
  --elev-2: 0 0 0 1px #3A474F, 0 2px 8px rgba(0,0,0,.50);
  --elev-3: 0 0 0 1px #4F5E68, 0 12px 32px rgba(0,0,0,.65);
  --bevel:  none;
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg-app:    var(--steel-950);
    --bg-card:   var(--steel-900);
    --bg-raised: var(--steel-800);
    --bg-sunken: #0A1014;
    --bg-inverse: var(--steel-025);

    --text-primary:   var(--steel-100);
    --text-secondary: var(--steel-300);
    --text-tertiary:  var(--steel-400);
    --text-inverse:   var(--steel-950);
    --text-disabled:  var(--steel-600);

    --border-separator: var(--steel-700);
    --border-subtle:    var(--steel-600);
    --border-control:   var(--steel-500);
    --border-strong:    var(--steel-400);

    --action-fill:       var(--steel-025);
    --action-on:         var(--steel-950);
    --action-fill-hover: var(--steel-100);
    --action-ghost-ink:  var(--steel-200);

    --state-received-ink:    #6FB8F5;
    --state-received-plate:  #12557F;
    --state-received-on:     #FFFFFF;
    --state-received-wash:   #10273A;
    --state-preparing-ink:   #E8B857;
    --state-preparing-plate: #5E3C07;
    --state-preparing-on:    #FFFFFF;
    --state-preparing-wash:  #2E2109;
    --state-ready-ink:       #4FC894;
    --state-ready-plate:     #0C5738;
    --state-ready-on:        #FFFFFF;
    --state-ready-wash:      #0D2E22;
    --state-delivered-ink:   #AAB8C0;
    --state-delivered-plate: #3A474F;
    --state-delivered-on:    #FFFFFF;
    --state-delivered-wash:  #1C262C;
    --state-attention-ink:   #FF9FB0;
    --state-attention-plate: #8E0F2B;
    --state-attention-on:    #FFFFFF;
    --state-attention-wash:  #33101C;
    --state-cancelled-ink:   #99A4AD;
    --state-cancelled-plate: #28333A;
    --state-cancelled-on:    #E1E7EA;
    --state-cancelled-wash:  #1C262C;

    --fssai-veg:    #4FC894;
    --fssai-nonveg: #D18A5A;

    --brand-fill: var(--steel-025);
    --brand-on:   var(--steel-950);
    --brand-ink:  var(--steel-200);
    --brand-wash: var(--steel-800);

    --focus-inner: #0F171B;
    --focus-outer: #E1E7EA;

    --elev-1: 0 0 0 1px #3A474F;
    --elev-2: 0 0 0 1px #3A474F, 0 2px 8px rgba(0,0,0,.50);
    --elev-3: 0 0 0 1px #4F5E68, 0 12px 32px rgba(0,0,0,.65);
    --bevel:  none;
  }
}

/* ==========================================================================
   DENSITY — one scale, three modes.
   ========================================================================== */

:root[data-density="counter"] {
  --text-display:  var(--fs-display-s); /* 34 */
  --text-title:    var(--fs-title);     /* 24 */
  --text-subtitle: var(--fs-title-s);   /* 20 */
  --text-body:     var(--fs-base-l);    /* 18 */
  --text-label:    var(--fs-base);      /* 16 */
  --text-caption:  var(--fs-base-s);    /* 14 — hard floor */
}

:root[data-density="dense"] {
  --text-display:  var(--fs-title-s);   /* 20 */
  --text-title:    var(--fs-base-l);    /* 18 */
  --text-subtitle: var(--fs-base);      /* 16 */
  --text-body:     var(--fs-base-s);    /* 14 */
  --text-label:    var(--fs-small);     /* 13 */
  --text-caption:  var(--fs-caption);   /* 12 */
}

/* ==========================================================================
   BASE
   ========================================================================== */

html { font-size: 16px; }

body {
  background: var(--bg-app);
  color: var(--text-primary);
  font-family: var(--font-ui);
  font-size: var(--text-body);
  line-height: var(--lh-ui);
  -webkit-text-size-adjust: 100%;
}

/* Numerals never inherit a Devanagari/Kannada fallback's proportional figures. */
.num, [data-num] {
  font-family: var(--font-numeric);
  font-variant-numeric: tabular-nums;
  font-feature-settings: "tnum" 1;
}

:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--focus-inner), 0 0 0 4px var(--focus-outer);
  border-radius: inherit;
}

@media (prefers-contrast: more) {
  :root { --border-control: var(--steel-500); --border-separator: var(--steel-400); }
  :root[data-theme="dark"] { --border-control: var(--steel-400); --border-separator: var(--steel-500); }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: .01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: .01ms !important;
    scroll-behavior: auto !important;
  }
}
```

> Note on the duplicated dark block: the values are written twice on purpose — once under
> `[data-theme="dark"]` for the explicit toggle and once under `prefers-color-scheme` guarded by
> `:root:not([data-theme="light"])`, so an explicit light choice always wins over the OS. If your
> build step supports it, author it once and emit both; do not collapse it to a single selector, and
> do not drop the `:not([data-theme="light"])` guard.

Per-restaurant injection, emitted inline in `<head>` at render time from the stored normalised values
— never computed in the client:

```html
<style>
  :root{
    --brand-fill:#3671C1; --brand-on:#FFFFFF; --brand-ink:#2D68B7; --brand-wash:#EDF4FE;
  }
  :root[data-theme="dark"]{
    --brand-fill:#20579F; --brand-on:#FFFFFF; --brand-ink:#72A6EF; --brand-wash:#0F1F37;
  }
</style>
```

---

## 13. Verifying this

Every ratio in this document came from a script, not judgement. Reproduce it with:

- **Contrast:** WCAG 2.x relative luminance (sRGB → linear via the 0.04045 / 12.92 piecewise
  transfer function), `(L₁ + 0.05) / (L₂ + 0.05)`.
- **Hue / chroma:** sRGB → linear → LMS → OKLab → OKLCH (Björn Ottosson's matrices).
- **Perceptual distance:** Euclidean in OKLab (ΔE-OK). >0.10 = clearly different colour.
- **Gamut clipping:** reduce chroma in 0.005 steps until the OKLCH triple maps inside sRGB.

Gates to enforce in CI, because these are the ones that regress:

1. Every `*-ink` ≥ 4.5:1 against **both** `--bg-card` and `--bg-app`, in both themes.
2. Every `*-on` ≥ 4.5:1 against its `*-plate`.
3. `--border-control` ≥ 3:1 against `--bg-card` in both themes.
4. Every normalised brand triple ≥ 4.5:1 — run the normalizer over a fixture list of at least the
   twelve hostile inputs in §3.5 on every change.
5. No state hue may fall within ΔE-OK 0.10 of `#FC8019`, `#E23744` or `#CB202D` **when used at field
   scale**; `needs-attention-plate` is the known exception at 0.099 and is permitted only at chip
   scale (§3.4).

---

## 14. Open decisions a builder must not invent

1. **Accessibility standard.** WCAG 2.2 AA assumed. Confirm.
2. **Stack.** Undecided. The <100 KB budget makes server-rendered / static-first with minimal
   hydration the only viable class, but the choice is the user's.
3. **Dark mode entry point.** Tokens are specified. Whether the customer surface follows the OS or is
   forced light (a restaurant's brand colour was chosen for a light ground) is a product decision.
   Recommendation: **customer surface follows the OS; dashboard offers a manual toggle** (a counter is
   bright by day and dim at night, and the operator knows which they want better than the OS does).
4. **Order-state vocabulary in Hindi and Kannada.** The six state labels must be translated by a
   native speaker, not machine-translated. "Ready" in particular has no single obvious equivalent and
   is the most safety-critical word on the board.
5. **Alert sound.** Needs real testing in a real kitchen. Specify after, not before.
6. **Whether "delivered" and "completed" are one state or two** for dine-in versus delivery. The
   brief names six states; dine-in "handed to table" and delivery "delivered to customer" may need to
   diverge.
