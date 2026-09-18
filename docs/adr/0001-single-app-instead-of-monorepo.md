# ADR 0001 — A single application instead of the Build Spec's monorepo

Date: 18 September 2026
Status: Accepted
Supersedes: Build Spec §15 (repository layout)

## Context

Build Spec §15 specifies a pnpm monorepo: `apps/web`, `services/voice`, `packages/db`,
`packages/shared`. That layout anticipates two deployables sharing library code.

At M1 there is one deployable: the Next.js application, which is also the API. The voice service
does not exist until M2, and when it does it is Python. It reaches the web application over HTTP
(Build Spec §5.6) and cannot import TypeScript under any circumstances.

So a workspace tool would be managing a single package, and the one genuine cross-language artefact
— the tool JSON Schemas and the consent notice texts — is plain data that both languages read from
disk.

## Decision

One application at the repository root. Internal module boundaries carry the modularity:

- `src/core/` — domain logic with no framework imports. Cart pricing, the order state machine, code
  redemption, serviceability, consent gating. Pure functions over plain data.
- `src/db/` — Drizzle schema, migrations, seed, repository functions.
- `src/adapters/` — one folder per vendor concern, each an interface plus a mock.
- `src/ui/` — design tokens and shared components.
- `app/` — routes only, kept thin.
- `contracts/` — language-neutral JSON and Markdown, read by TypeScript now and by Python at M2.

When the voice service arrives it becomes a sibling top-level `services/voice/` with its own Python
tooling. Nothing restructures.

## Consequences

Good: no workspace tooling to maintain, one `package.json`, one install, one test command. The
boundary that actually matters — domain logic separated from delivery mechanism — is enforced by a
lint rule rather than by directory ceremony, which means it is checked rather than assumed.

Bad: this file is now the only place recording that the repository does not match the Build Spec's
diagram. Anyone reading §15 and expecting `packages/` will be briefly confused.

Reversal cost: low. Extracting `src/core/` into a package later is a directory move plus a
`package.json`, and nothing outside it needs to change, because nothing outside it imports its
internals.

## Note on the package manager

The Build Spec assumes pnpm. `corepack prepare pnpm@latest` fails on this machine with a broken
module cache. With no workspaces to manage, npm — already installed — is sufficient, so the repo
uses npm rather than spending time on the corepack fault. If workspaces ever return, revisit.
