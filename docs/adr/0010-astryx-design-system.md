# ADR 0010 — Astryx supplies the components and the look

Date: 19 November 2026
Status: Accepted
Supersedes: ADR 0008
Amends: `docs/design/steel-and-enamel.md` (the neutral chrome only — see "What stays"), ADR 0003
(the secondary JavaScript guard is withdrawn; the ≥ 85 floor stays — see "Measured")

## Context

The product asked for the Astryx design library (`@astryxdesign/core`, Meta's React design system,
StyleX-styled, MIT) to be added and the UI updated with it. Three decisions were put to the product
owner and answered:

1. **Look: adopt a stock Astryx theme** rather than re-skin Astryx in Steel & Enamel.
2. **Scope: every surface**, the customer ordering page included, measured afterwards.
3. **ShadCN: replaced**, so the repository has one component library.

## Decision

**Install.** `@astryxdesign/core`, `@astryxdesign/theme-neutral` and `@stylexjs/stylex` (the core's
peer), pinned to the exact same version because the theme's peer range is exact. `@astryxdesign/cli`
is a dev dependency: `npx astryx component <Name>` is the component reference. The prebuilt path is
used — `reset.css`, `astryx.css`, the theme's `theme.css` — so there is no StyleX build plugin.

**Theme: neutral.** The neutral theme is the documented default and the closest in spirit to what it
replaces (quiet, near-black accent, colour reserved for meaning). Two of its tokens are overridden,
in `app/globals.css`, and only these: `--font-family-body` and `--font-family-heading`. The theme
names Figtree first and ships it from Google Fonts. ServeLine loads no webfont (ADR 0003) and
Figtree has no Devanagari or Kannada, so both point at `--font-ui`, the stack that covers all three
scripts. `fonts.css` is deliberately not imported.

**Cascade.** `app/layers.css` declares the layer order and is imported first (Next.js hoists
`@import`s above inline CSS, so the order line cannot live in `globals.css`). `tokens.css` sits in
an `app-base` layer below `astryx-base`, so an Astryx component's own focus ring and typography beat
our global base rules. CSS modules stay unlayered and remain the override for a component.

**Theme switching.** Astryx keys dark mode on `html[data-theme]` and `light-dark()` — the same
attribute ADR 0002 §3 already writes from the staff theme cookie. The root layout passes that
choice to `<Theme mode>` through `app/Providers.tsx`, and also writes `data-astryx-theme="neutral"`
on `<html>` server-side, because the theme's tokens are scoped to that attribute and the first paint
must not wait for hydration. No cookie means `system`, which is what every customer gets.

**Tokens.** `tokens.css` keeps its role names (`--bg-card`, `--text-secondary`, `--action-fill`,
`--radius-3`, `--elev-2` …) so no CSS module had to change, and points each neutral role at an
Astryx token: surfaces, text, borders, the action plate, radius, elevation and focus. Because Astryx
writes those as `light-dark()` pairs, the neutral roles no longer appear in the two dark blocks.
`tokens.test.ts` now reads the theme's own stylesheet and splits each pair per mode, so the §13
contrast gates still measure the colours that actually paint.

**Components.**
- `src/ui/Button.tsx` is still the one Button, now an adapter over Astryx's. It keeps ServeLine's
  variant and size vocabulary (`primary`/`ghost`/`brand`/`danger`, `customer`/`counter`/`dense`)
  so its call sites are unchanged, and overrides the height to keep the 44/56/32 touch targets —
  Astryx's own sizes are 28/32/36, mouse sizes.
- The ShadCN primitives were used in three places and are replaced by Astryx's: `Switch`
  (menu availability), `AlertDialog` (delete confirm), and the styleguide's demos of `Selector`,
  `TabList`, `Dialog`, `DropdownMenu`, `Popover`, `Tooltip` and `useToast`.
- `src/ui/primitives/`, `shadcn-bridge.css`, `cn.ts`, `components.json` and seven dependencies
  (`radix-ui`, `class-variance-authority`, `clsx`, `tailwind-merge`, `sonner`, `tw-animate-css`,
  `cn`, plus the direct `lucide-react`, which the theme now brings itself) are removed.
- Tailwind stays for page layout in `app/`, with Astryx's `tailwind-theme.css` bridge in place of
  ours, so a named utility resolves to an Astryx token.

**What stays ServeLine's own.** The order-state enamel and the FSSAI marks. They are product
semantics, not decoration, and their pairs are enforced by `tokens.test.ts`; Astryx's status hues
(a yellow warning fill at 1.5:1 on a card) would fail the chip-boundary gate. One state value moved:
the dark attention plate went from `#C92B57` to `#D1335E`, because on Astryx's dark card (`#262626`)
the old plate measured 2.86:1 — the gate caught it. `--border-control` is the one neutral role with
its own value (`#8f8f8f` / `#7a7a7a`): Astryx's emphasised border is 1.5:1 on white, below SC 1.4.11
for the native inputs the server-action forms use. Type sizes, space, touch targets and motion are
layout decisions and are unchanged.

## Measured

ADR 0003's profile (Lighthouse 12, mobile, simulated 150 ms RTT / 1.6 Mbps / 4× CPU), production
build, `/r/demo?c=WELCOME10`, three runs:

| Metric | Before (ADR 0003) | After |
|---|---|---|
| Performance | 99 | **89 / 95 / 93** |
| Accessibility | 100 | 100 |
| FCP | 0.9 s | 1.4 s |
| LCP | 2.2 s | 2.5–2.7 s |
| TBT | 30 ms | 170–340 ms |
| Total byte weight | 169 KiB | 336 KiB |
| Script transferred (gzip) | 184 KB | 264 KB |
| Stylesheets transferred | — | 61 KB (`astryx.css` is 54 KB of it) |

The primary budget (≥ 85) holds. The median, 93, is above ADR 0003's "below 90 needs a reason" line;
one run of three fell to 89.

**The secondary guard does not hold.** ADR 0003 keeps the page's non-framework JavaScript under
40 KB gzipped (it was ~30 KB). Astryx adds about 88 KB to this page by itself: its Button brings
the press, hit-area, haptics and layer (tooltip) machinery, and the root `<Theme>` brings the
reader-text-size probe. That is recorded here rather than resolved by quietly raising the number.
**Resolved, 20 November 2026 — the product owner's decision.** The restaurant dashboard is the
primary product experience and the customer ordering page is secondary; customers are on 4G, not
the 3G profile ADR 0003 was written against. So:

- ADR 0003's **40 KB non-framework JavaScript guard is withdrawn.** The ordering page is not kept
  on native buttons, and Astryx is not stripped from it.
- The **Lighthouse ≥ 85 floor stays**, as a regression alarm rather than a design constraint: it
  still passes (89–95 above), and a drop below it means something broke, not that Astryx cost too
  much. ADR 0003's "below 90 needs a reason" line is withdrawn with the guard.
- Effort on UI goes to the restaurant dashboard (`/app`) first.

## Consequences

Good: one component library, with Astryx's keyboard and ARIA behaviour, in both themes, with no
second theme system and no second Button. Every CSS module followed the new theme without being
edited, because the roles it reads were re-pointed rather than renamed.

Bad: the look is no longer the researched Steel & Enamel chrome — the bevel, the steel ramp's
measured surfaces and the 2–12 px radius scale are gone in favour of Astryx's. The design document
still describes them; read it for the state, FSSAI, density and motion sections, and this ADR for
the neutral chrome.

Also bad: the ordering page is heavier, as measured above — accepted, because the dashboard is the
primary experience.

Lint: `npm run lint` (`next lint`) fails before and after this change — Next.js 16 removed the
command. Not touched here.

Reversal: Astryx is three dependencies, three CSS imports, `Providers.tsx`, the Button adapter and
the neutral-role block of `tokens.css`. Pointing those roles back at the steel ramp restores the old
chrome without touching any module.
