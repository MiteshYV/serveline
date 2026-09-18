# ADR 0002 — Resolving the design language's open decisions

Date: 18 September 2026
Status: Accepted
Context: `docs/design/steel-and-enamel.md` §14 lists six decisions the design research declined to
invent. Four are technical and are settled here; two are product decisions and are recorded as
pending with an interim.

## 1. Accessibility standard → WCAG 2.2 AA

The design's every contrast pair was computed against it. Nothing in the Ideation file asks for more,
and the audience (low-end Android, low tech comfort, three scripts) is exactly who AA protects.

## 2. Stack → server-rendered Next.js, minimal hydration

Already decided in ADR 0001. The <100 KB JS budget on the ordering page is met by writing server
components and hydrating only the cart, the stepper and the OTP field.

## 3. Dark mode → customer follows the OS; dashboard has a manual toggle

The design's own recommendation, adopted. A restaurant's brand colour is normalised for both themes,
so the customer page is safe either way. A counter is bright at noon and dim at 11pm, and the
operator knows which they want better than the OS does.

## 4. Order-state labels in Hindi and Kannada → interim translations, flagged for native review

No native speaker is on the team. The six labels ship in `contracts/i18n/order-states.json` with a
`reviewed: false` flag per language, and the dashboard shows them. "Ready" is the safety-critical one
and has no single obvious equivalent in either language; the interim is a best effort and the file
says so. **Pending: a native speaker reviews before the first pilot restaurant is live.**

## 5. Alert sound → deferred until a real kitchen

Specify after testing, not before. M1 ships a placeholder two-tone chime behind the same
"tap to enable sounds" gesture the design specifies, so the audio-unlock flow is built and tested
even though the sound itself will change.

## 6. "Delivered" for dine-in → one state, two labels

Build Spec §4 has a single terminal success state, `delivered`, and §12's metric definition
("status delivered or dine-in completed") treats them as one. The state stays one. The UI label
differs by fulfilment: **Delivered** for delivery, **Served** for dine-in, **Collected** for pickup.
A label is not a state; adding a state to the enum for a wording difference would be scaffolding.
