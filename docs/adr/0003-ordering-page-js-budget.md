# ADR 0003 — The ordering page's JavaScript budget

Date: 20 September 2026
Status: Accepted
Amends: Build Spec §6 ("under 100 KB of JavaScript")

## Context

Build Spec §6 sets the customer ordering page a hard budget of 100 KB of JavaScript, in service of
one outcome: usable on a low-end Android over 3G. §16 states the outcome directly — Lighthouse
mobile performance above 85 on a throttled 3G profile.

Measured on 20 September 2026 against the production build (`next start`), the page at
`/r/demo?c=WELCOME10` ships **184 KB of JavaScript, gzipped** (602 KB raw), in ten chunks:

| Chunk | gzip | What it is |
|---|---|---|
| react-dom | 69 KB | React 19 |
| Next.js client runtime, two chunks | 71 KB | router, RSC client, hydration |
| shared app chunks | ~25 KB | UI components, i18n dictionary (8 KB, all three languages) |
| the page's own client code | 5 KB | cart, stepper, option chooser (`MenuClient`) |

Everything outside the last two rows is the framework floor. React DOM plus the App Router runtime
is roughly 140 KB gzipped before a line of ServeLine code runs. The budget as written cannot be met
on this stack by any amount of trimming, and ADR 0001 committed the product to this stack for good
reasons that still hold.

The outcome, measured the way §16 asks — Lighthouse 12 mobile, simulated throttling at 150 ms RTT,
1.6 Mbps, 4× CPU slowdown, on the same production build:

| Metric | Result | Target |
|---|---|---|
| Performance | **99** | > 85 |
| Accessibility | **100** | — |
| First Contentful Paint | 0.9 s | — |
| Largest Contentful Paint | 2.2 s | — |
| Total Blocking Time | 30 ms | — |
| Cumulative Layout Shift | 0 | — |
| Total byte weight | 169 KiB | — |

The page is server-rendered: the menu, prices and category navigation are in the HTML and paint
before any script arrives; JavaScript adds the cart and the choosers. Zero webfonts and no images by
default (design §4.1, §7.3) are what keep the byte weight and LCP where they are.

## Decision

The byte figure in Build Spec §6 is replaced by the outcome it stood for. The ordering page's
performance budget is: **Lighthouse mobile performance ≥ 85 on the §16 throttled profile, measured
on the production build, on every change to the customer surface.** The current 99 is the baseline;
a change that drops it below 90 needs a reason.

A secondary guard so the app's own contribution does not creep: **the page's non-framework
JavaScript stays under 40 KB gzipped** (today: ~30 KB). The i18n dictionary is the first thing to
split per language if that line is approached.

## Consequences

The Build Spec's "100 KB" sentence is now wrong for this repository and this ADR is the record.
Anyone quoting it should quote this instead.

If a real pilot shows the customer surface failing on the devices that matter — the test is real
handsets in a real Bangalore kitchen, not a simulator — the escape hatch is to serve `/r/{slug}`
from something lighter than the App Router (a server-rendered page with a few hundred lines of
plain JavaScript for the cart). That is a rewrite of one surface, not of the product: `src/core`,
the repositories and the API are unchanged by it. Do not take it pre-emptively; the numbers say it
is not needed.

## How to reproduce

```sh
npm run build
SESSION_SECRET=$(openssl rand -hex 32) PHONE_HASH_PEPPER=$(openssl rand -hex 32) VENDOR_MODE=mock npx next start -p 3001
npx lighthouse 'http://localhost:3001/r/demo?c=WELCOME10' --form-factor=mobile --screenEmulation.mobile \
  --throttling-method=simulate --throttling.rttMs=150 --throttling.throughputKbps=1638 \
  --throttling.cpuSlowdownMultiplier=4 --only-categories=performance,accessibility --output=json
```
