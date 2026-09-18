# ServeLine M1 — design

> Agreed 18 September 2026. Covers Build Spec §14 milestone M1: orders without AI.
> Product decisions are not made here. Where this document and `ServeLine — Ideation.md` disagree,
> Ideation wins.

## Purpose

Deliver the two surfaces that work without a telephone number: the customer ordering page and the
restaurant dashboard. Together they prove the win-back loop end to end — a Direct Order Card scanned
by a customer becomes a paid direct order visible at the counter — which is the mechanism the whole
business rests on (Ideation §6).

M1 is also where the shape of everything after it is set. The order state machine, the consent
record, the cart and the code-redemption rules written here are reused unchanged by the voice
service at M2. They are built as pure functions for exactly that reason.

## Build mode

Portfolio-first, pilot-ready. No vendor account exists. Every external dependency sits behind an
adapter interface with a working mock, so the product runs end to end on a laptop. A live account
later is a new implementation of the same interface, selected by environment variable.

This is not a shortcut around the vendors. It is the shortcut around *waiting* for them — DLT
template approval alone is a two-to-four week external dependency (Ideation §8) that would otherwise
block the first line of code.

## Architecture

One Next.js application. Four layers, and the direction of dependency is the whole point:

```
  app/            routes: three surfaces + the API        ──┐
                                                            │ depends on
  src/adapters/   payments · sms · storage · llm           ──┤
  src/db/         schema · migrations · repositories       ──┤
  src/core/       cart · orders · codes · consent          ←─┘  depends on NOTHING
```

`src/core/` imports neither `next`, nor `react`, nor the database. It is plain functions over plain
data. A cart total, a legal state transition, whether a code may be redeemed — none of those
questions need a web request or a database connection to answer, so they do not get one. This is
enforced by a lint rule, not by convention.

The consequence that matters: at M2 the voice service calls `POST /api/v1/voice/tools/add_to_cart`,
that route calls the *same* `src/core/cart` function the ordering page calls, and the pricing cannot
drift between the two channels. Modularity here is not tidiness; it is the thing that stops the AI
quoting a different price than the web page.

### The three surfaces

| Surface | Route | Audience | Shape |
|---|---|---|---|
| Ordering page | `/r/{slug}` | Diners, low-end Android, 3G | Server-rendered, under 100 KB of JS, no app install |
| Dashboard | `/app` | Counter staff and owner | Mobile-first, glanceable at arm's length |
| Agent console | `/agent` | ServeLine's own staff | Dense, desktop, data-heavy |

The ordering page's JS budget is a hard constraint from Build Spec §6, not an aspiration. It decides
the framework posture: server components by default, client components only where interaction
genuinely requires them (cart, quantity stepper, OTP entry).

## Data model

Build Spec §4 tables required by M1 only:

`restaurant`, `outlet`, `staff_user`, `platform_user`, `menu`, `menu_category`, `menu_item`,
`item_variant`, `item_option_group`, `item_option`, `customer`, `customer_restaurant`,
`consent_record`, `customer_address`, `customer_preference`, `order`, `order_item`, `order_event`,
`payment`, `card_batch`, `discount_code`, `code_redemption`, `sms_message`, `external_order_count`,
`audit_log`.

Deferred to the milestone that first writes to them: `call`, `call_turn`, `call_recording`,
`call_cost`, `menu_vocabulary` (M2–M4); `usage_ledger`, `invoice`, `mandate`, `dsar_request` (M5);
`onboarding_checklist` (M4).

`order.call_id` is omitted at M1 and added by the M2 migration. Cheap migrations are why the Build
Spec chose Drizzle; this is that choice being spent.

Non-negotiable from day one, because retrofitting each is expensive or illegal:

- Money in paise as integers, everywhere.
- `phone_hash` (SHA-256 with a server pepper) alongside every phone number, and joins use the hash.
- A `consent_record` written before any customer field beyond the phone number is stored.
- `audit_log` on every customer-data write, via the repository layer rather than at call sites.

### Order states

Per Build Spec §4. M1 implements the subset reachable without a call:

```
received → confirmed → preparing → ready → out_for_delivery → delivered
received → awaiting_payment → confirmed        (UPI link orders)
any non-terminal → cancelled                   (reason required)
```

`address_pending` and `needs_attention` exist in the enum but are only produced by the voice service,
so at M1 they are reachable only through the dashboard's manual-order path. The transition table
lives in `src/core/orders` as data, and an illegal transition throws rather than being silently
ignored.

## Adapters

| Concern | Interface | M1 mock | Real, later |
|---|---|---|---|
| Payments | create link, read status, verify webhook | Generates a link, fires a realistic signed webhook on a timer or on a "pay" button | Razorpay Route |
| SMS | send on template | Writes to an in-app SMS inbox screen, viewable in the UI | Exotel, MSG91 fallback |
| Storage | put, signed get | Local disk under `/uploads`, gitignored | S3 ap-south-1 |
| LLM | complete with tools | Fixture responses | Gemini primary, Claude secondary |

The SMS mock deserves a note: an on-screen inbox is a *better* demo artefact than a real message,
because a walkthrough can show the OTP, the order confirmation and the payment link without anyone
holding a phone. It is also how OTP works in demo mode.

## Error handling

Three classes, handled differently:

**Customer-facing failures** — a payment that never completes, a menu item that sells out mid-cart,
a pincode outside the delivery radius. These are ordinary states, not exceptions. Each has a
designed screen with a way forward, because the user is a stranger on a phone who will simply leave.

**Operator-facing failures** — an order that fails to reach the dashboard, an SSE connection that
drops. The dashboard has a 5-second polling fallback behind the event stream (Build Spec §7), so a
dropped connection degrades to slower rather than to silent. Silent is the failure mode that costs a
restaurant a customer.

**Programmer errors** — an illegal state transition, a cart line referencing an unknown item, money
arriving as a float. These throw. They are bugs, and a bug that fails loudly in development is
cheaper than one that produces a wrong order at 8pm on a Saturday.

Validation sits at the trust boundary: every API route validates its input against a schema before
anything in `src/core/` sees it. Core functions may then assume well-formed data, which is what
keeps them small.

## Testing

Unit tests on `src/core/` carry the weight, and they are cheap precisely because that layer has no
dependencies to stand up: cart totals with variants and options, every legal and illegal order
transition, one-redemption-per-phone-per-restaurant, serviceability by pincode, consent gating,
discount arithmetic in paise.

One integration test per acceptance criterion in Build Spec §14 M1, run against a real PGlite
database rather than mocks, because the criteria are about the system and a mocked database would
test the mock.

No end-to-end browser suite at M1. It is the slowest, most brittle tier and there is not yet enough
surface to justify maintaining it. It arrives with M3, when there are flows worth protecting.

## Acceptance — done when

From Build Spec §14 M1, verbatim:

1. A test restaurant takes a delivery order from a scanned card with the code applied.
2. It is paid by UPI and settles to that restaurant's own linked account. *(Mocked at M1; the
   adapter's interface is the real one.)*
3. The dashboard shows the order within 5 seconds and can advance it to delivered.
4. A second redemption of the same code by the same phone is refused.
5. A table-context order carries the table number.
6. The Monday aggregator prompt appears and persists until answered.

## Out of scope

Everything in Ideation §11 "Does not ship", plus, deferred within this build: the voice service and
the whole call pipeline (M2, M3), menu digitisation from photographs and the vocabulary tuning loop
(M4), retention jobs, erasure workflow, billing, invoices, mandates and the Metabase metric views
(M5). The agent console exists at M1 only as far as M1 needs it; its real content is M4.

Deployment, CI and hosting are deliberately absent. The application runs locally and that is the
requirement until there is something worth hosting.
