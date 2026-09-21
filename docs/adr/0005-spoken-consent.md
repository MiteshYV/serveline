# ADR 0005 — Spoken consent, and a fourteenth tool

Date: 21 September 2026
Status: Accepted
Extends: Build Spec §5.5 (the tool list), implements Build Spec §10 (voice consent)

## Context

M2's review found that `place_order` wrote a `customer_restaurant` profile row for a caller who had
never agreed to anything — the web checkout gates exactly that write on live `order_fulfilment`
consent, and the call did not. The gate went in.

The gate then made the assistant useless to the caller it exists for. Ideation §7 calls the AI call
assistant the wedge: *every restaurant is already being called*. A stranger phoning a restaurant is
the primary case, and with the gate alone they cannot order — only a customer who had already
consented somewhere else could, which inverts the product.

Build Spec §10 already decides the answer: "Voice consent is the spoken yes after the notice,
captured as `channel = call` with the call id as evidence." What it does not give is a tool to
record that yes. §5.5 lists thirteen tools and none of them is it.

## Decision

A fourteenth tool, `record_consent(agreed: boolean)`, in `contracts/voice-tools.json` and
`src/voice/tools.ts`. It writes a `consent_record` with `channel: 'call'`, the notice version in
force, and `evidence: { callId, transport, rendering: 'spoken' }`.

The words the caller hears are a **spoken rendering of the same notice version** —
`contracts/notices/v1/spoken-{lang}.md`, about sixty words against the read notice's two hundred and
fifty. Same version, because it describes the same handling of the same data, so a `consent_record`
pointing at `v1` is honest whichever rendering the customer got. Fewer purposes: the spoken words
cover `order_fulfilment` and `order_history` only, so a call consent grants less than a page consent.
`call_recording` belongs to the telephone transport, whose greeting carries its own recording notice
(Build Spec §5.2); the browser transport records nothing.

The prompt carries the notice only for a caller without live consent, and instructs the assistant to
read it word for word before placing anything. `place_order` refuses `consent_required` until it is
recorded — the prompt is the manners, the gate is the guarantee.

A caller who says no is offered the ordering page by SMS. A handoff before consent parks no order:
the transfer still happens and the transcript keeps the cart, but nothing is written on the caller's
behalf.

## Consequences

Good: the call channel works for a stranger, which is the wedge; and it works by recording real
consent rather than by skipping the check.

Bad: an extra exchange on a first call, which is the cost of asking. And a fourteenth tool is a
departure from §5.5's list — anyone comparing the two should read this file.

**Counsel has not reviewed the spoken rendering.** Ideation §15 already flags the consent approach as
"a legal reading, not counsel-reviewed"; this sits inside that gap, not beside it. Two specific
questions for that review: whether a shortened spoken rendering may carry the same version as the
read notice, and whether a recorded spoken "yes" is sufficient evidence under the DPDP Rules. The
Hindi and Kannada renderings are interim translations (ADR 0002 §4).

An anonymous call — a transport that carries no number at all — still cannot place an order, because
there is no identity to attach consent or an order to. That is the browser simulator's "new caller"
and, later, a withheld caller ID.
