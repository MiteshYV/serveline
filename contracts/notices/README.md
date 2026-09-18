# Consent notices

The text a customer agrees to before ServeLine stores anything about them beyond their phone number.
Build Spec §10; Ideation §15 (DPDP Act 2023 and the DPDP Rules 2025).

```
contracts/notices/
  v1/en.md   v1/hi.md   v1/kn.md
```

One directory per notice version, one file per language — `hi`, `en`, `kn`, the three the MVP
supports (Ideation §11). The directory name is the exact value stored in
`consent_record.notice_version`, so `v1/` and the string `v1` must never drift apart.

Markdown, not TypeScript, because the Python voice service reads these same files at M2 and speaks
the notice aloud before recording (ADR 0001). Anything only TypeScript can read does not belong
here.

## Never edit a notice in place

A consent record does not store the words the customer read. It stores a pointer: *this customer
agreed to v1*. Change the words behind that pointer and every existing record now claims agreement
to something the customer never saw — and nothing in the data can tell you which text they actually
agreed to. That is not untidiness. Consent you cannot evidence is, under the DPDP Act, consent you
do not have.

So a change of meaning is a new directory: `v2/en.md`, `v2/hi.md`, `v2/kn.md`, a new
`effective_date`, and re-consent from customers whose existing grant does not cover the new
purposes. Old versions stay in the repository permanently, because records point at them.

## "But it is only a typo"

You cannot tell from inside the code whether a typo changed the meaning. A missing "not" is a typo.
So is "90 days" where "12 months" was meant, or a dropped negative in the sentence about other
restaurants. The person approving the fix is not counsel, and the customer who agreed to the broken
sentence is not available to re-read the corrected one.

The rule is therefore mechanical, with no judgement call at the keyboard: **files under a version
directory are immutable once that version has been shown to a customer.** Fix a typo by cutting v2.
It costs one directory.

The only permitted edit is to a version never released — while it exists on a branch and no
`consent_record` references it.

## Frontmatter

Every file starts with:

```yaml
version: v1              # matches the directory name
language: en             # matches the `language` enum: hi | en | kn
effective_date: 2026-09-18
purposes:                # what this version covers
  - order_fulfilment
  - order_history
  - personalisation
  - call_recording
```

| Purpose key | Covers |
|---|---|
| `order_fulfilment` | Taking, preparing and delivering the order |
| `order_history` | Keeping past orders against the customer's profile at this restaurant |
| `personalisation` | Suggesting dishes from that history |
| `call_recording` | Recording and transcribing calls |

`purposes` here is what the *notice* covers. `consent_record.purposes` is what a given customer
actually granted, which may be a subset — a page order grants no `call_recording`, because no call
happened. `src/core/consent.ts` answers "is this purpose covered, under the version this customer
agreed to", and a purpose absent from the version they signed is not granted no matter what the
record says.

Adding a purpose key to an existing version is a change of meaning. New directory.

## `{{restaurant_name}}`

The only placeholder. The restaurant is the data fiduciary and ServeLine is its processor, so the
notice must name the restaurant the customer is ordering from. It is substituted at render on the
page and before text-to-speech on a call. Keep the count of placeholders at one: every new one is
another thing the voice service must also know how to fill.
