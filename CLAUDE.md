# ServeLine

## What this is

An AI-first ordering platform for Indian SMB restaurants. Read `ServeLine — Ideation.md` first, in
full, then `ServeLine — Build Spec.md`.

**Product decisions live in the Ideation file. If the behaviour you need is not decided there, stop
and ask.** Do not invent product behaviour. Do not change the fee, the call allowance or the trial
rules in code without a matching change in the Ideation file.

Where this repository departs from the Build Spec, there is an ADR in `docs/adr/` saying so. Read
them before assuming the Spec's layout or stack is what is actually here.

## Build mode

Portfolio-first, pilot-ready. Every external vendor sits behind an adapter interface in
`src/adapters/` with a working mock. No vendor account is required to run the product end to end.
When a real account arrives, it is a new implementation of the same interface plus an environment
variable — never a change to calling code.

Current milestone: **M1** — ordering page and dashboard, no AI. See Build Spec §14.

## Conventions

- TypeScript strict. No `any` that survives review.
- **Money in paise, as integers.** Never floats, never rupees, anywhere.
- Times stored in UTC. Rendered in Asia/Kolkata.
- UK English in all user-facing copy and in comments.
- Consent notice texts are versioned and **never edited in place**. A change means a new version.
- Every write to customer data goes through a repository function that also writes the audit log.
- No vendor call without its environment variable set. A missing variable is an error, not a silent
  fallback to a mock — mocks are selected explicitly by `VENDOR_MODE=mock`.
- No PII in logs, ever. Log `phone_hash` and ids. Never a phone number, never a full address.
- Phone numbers are stored only on `customer`, `staff_user`, `platform_user` and `outlet`.
  Everywhere else, use `phone_hash`.

## Where code goes

- `src/core/` — domain logic. **No imports from `next`, `react`, or the database.** Pure functions
  over plain data. This is the layer the voice service's tool calls will reuse at M2, so keep it
  free of anything web-shaped.
- `src/db/` — Drizzle schema, migrations, seed, and the repository functions.
- `src/adapters/` — one folder per vendor concern. Interface, mock, and (later) the real client.
- `src/ui/` — design tokens and shared components. Tokens are CSS custom properties; do not
  hard-code a colour or a spacing value in a component.
- `app/` — routes only. Thin. Business rules belong in `src/core/`.
- `contracts/` — plain JSON and Markdown that the Python voice service will also read at M2.
  Language-neutral by design. No TypeScript in here.

## Commands

```sh
npm run dev          # start the app
npm run db:migrate   # apply migrations
npm run db:seed      # load the sample Bangalore restaurant
npm test             # unit tests
npm run lint
npm run typecheck
```

## Definition of done

A milestone is done when the acceptance criteria in Build Spec §14 pass — not when the code exists.
Where a criterion says "on a real phone", it means on a real phone.

## Do not

- Create fake payments outside the mock adapter or the gateway's test mode.
- Put customer-supplied text into an LLM prompt without stripping numbers first.
- Store a phone number outside the four tables named above.
- Add a dependency for something a few lines of standard library would do.
- Scaffold for a milestone that has not started. Empty folders are not architecture.
