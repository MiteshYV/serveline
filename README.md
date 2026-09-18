# ServeLine

An AI-first ordering and customer-ownership platform for Indian SMB restaurants. Bangalore first.

A restaurant keeps its existing phone number, forwards it to an AI that takes orders in Hindi, English
and Kannada, and owns the resulting customer database outright. The aggregators acquire the customer;
ServeLine takes the relationship from order two onward.

## The documents

| File | What it is |
|---|---|
| `ServeLine — Ideation.md` | Canonical product thinking. Where the three documents disagree, this one wins. |
| `ServeLine — Build Spec.md` | How to build what Ideation decided. |
| `docs/adr/` | Every place this repository deliberately departs from the Build Spec, and why. |
| `docs/superpowers/specs/` | Design specs, one per milestone, agreed before implementation. |

## Current state

Milestone M1: ordering page and restaurant dashboard, no AI yet.

Built in portfolio-first mode — every external vendor (payments, SMS, telephony, speech, LLM) sits
behind an adapter interface with a mock implementation. No vendor account is needed to run the
product end to end. Swapping in live credentials is a configuration change, not a rewrite.

## Getting started

```sh
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

Then open http://localhost:3000. The seed loads a fictional Bangalore restaurant with a
three-language menu, a Direct Order Card batch and a discount code.

## Layout

```
app/          Next.js routes — the three surfaces and the API
  (customer)/   ordering page, /r/{slug}
  (restaurant)/ counter dashboard, /app
  (platform)/   internal agent console, /agent
  api/v1/       the API, shared by all three and by the voice service at M2
src/
  core/       domain logic with no framework imports — cart, order state, codes, consent
  db/         Drizzle schema, migrations, seed
  adapters/   payments, sms, storage, llm — one interface and one mock each
  ui/         design tokens and shared components
contracts/    language-neutral files the Python voice service will also read at M2
docs/         ADRs, runbooks, design specs
```
