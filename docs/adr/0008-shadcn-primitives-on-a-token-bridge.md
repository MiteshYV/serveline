# ADR 0008 — ShadCN supplies the primitives; Steel & Enamel keeps the look

Date: 23 September 2026
Status: Accepted
Amends: `app/globals.css` (the "never a utility class" rule), ADR 0002 §3 (dark mode, unchanged but now load-bearing for a second consumer)

## Context

The product asked for a clean, consistent UI in light and dark, built with ShadCN.

Two facts about this repository make that a design decision rather than an install.

First, there is already a design language. `docs/design/steel-and-enamel.md` and `src/ui/tokens.css`
were produced by research, and the palette carries computed WCAG ratios in its comments. It has
named laws — colour is never a button, plates not pills, never colour alone, delivered returns to
steel, seams not shadows. ShadCN ships its own look: neutral greys, rounded pills, soft shadows,
colour used as the primary action. Adopting that look wholesale would discard the research and make
the product resemble every other dashboard in the category.

Second, `app/globals.css` states a rule that ShadCN appears to break: *components under `src/ui`
read tokens through their own CSS modules and never use a utility class*. That rule exists so
`tokens.css`, imported unlayered, always beats Tailwind preflight. ShadCN components are Tailwind
utility classes by construction.

Against that, the thirteen existing components in `src/ui` cover cards, chips, fields and steppers,
and cover them well — but the repository has no Select, no Dialog, no Tabs, no Popover, no Tooltip,
no DropdownMenu and no Switch. Those are the components where hand-rolling reliably produces
accessibility defects: focus trapping, roving tabindex, `aria-expanded`, Escape handling, returning
focus to the trigger on close.

## Decision

ShadCN is added for the interactive primitives the repository lacks, in `src/ui/primitives/`. The
thirteen existing components stay exactly as they are.

`src/ui/shadcn-bridge.css` gives every semantic utility a ShadCN component uses — `bg-background`,
`text-muted-foreground`, `border-input`, `ring-ring`, `rounded-lg` — a Steel & Enamel token as its
value, through Tailwind v4's `@theme inline`. Verified in the compiled stylesheet:

```
.bg-background          background-color: var(--bg-app)
.bg-primary             background-color: var(--action-fill)
.text-primary-foreground color: var(--action-on)
.border-input           border-color: var(--border-control)
.bg-popover             background-color: var(--bg-raised)
.rounded-lg             border-radius: var(--radius-4)
```

`inline` is what makes this work. Without it Tailwind copies today's computed value into its own
variable, which would snapshot the light palette and break dark mode.

The `globals.css` rule is amended rather than deleted. Its letter was "no utility classes in
`src/ui`"; its purpose was "a component cannot introduce a colour, a radius or a font the design
system has not decided". The purpose is preserved exactly: there is not one raw value in the bridge,
only `var(--token)`. **A utility that does not resolve to a token is a bug, not a shortcut.**

Two consequences follow from doing it this way rather than the stock way:

- **No `.dark` class and no `next-themes`.** `tokens.css` already re-points every role under
  `[data-theme="dark"]` and under `prefers-color-scheme`. A primitive that reads the bridge is
  correct in both themes without a single `dark:` utility. A `dark:` utility inside a primitive is a
  second source of truth and gets deleted rather than fixed. The `@custom-variant dark` in the
  bridge exists only so that any that do survive agree with the tokens around them.
- **One Button, not two.** `shadcn add` pulled its own `button.tsx`, which would have put two
  different buttons in a codebase whose brief was consistency. It was deleted; `Dialog` and
  `AlertDialog` were rewired to `src/ui/Button.tsx`, whose `danger` variant already carries the
  design's §11.1 note that it is permitted only inside a destructive confirm. `asChild` moved onto
  the Radix primitive, since our Button renders a real `<button>` or `<a>` and has no Slot.

## Consequences

Good: the primitives that are hardest to get right arrive with Radix's keyboard and ARIA behaviour
and with this product's palette, in both themes, with no second theme system and no second button.
The design language is unchanged — every law still holds, because no primitive can express a value
the tokens have not already decided.

Bad: a second styling idiom now exists in `src/ui`. A reader must know that `primitives/*` is
utility-classed and everything else is CSS modules. The bridge is the seam, and it is one file.

Also bad: dependency weight. `radix-ui`, `lucide-react`, `class-variance-authority`, `clsx`,
`tailwind-merge` and `sonner` are new. CLAUDE.md forbids adding a dependency for what a few lines of
standard library would do — focus trapping and roving tabindex are not that. But ADR 0003 holds the
customer ordering page to Lighthouse mobile ≥ 85, and it currently measures 99. **Every primitive
introduced on the customer ordering path must be measured against that budget before it ships**, and
a primitive that costs more than it earns there belongs on the staff surfaces only.

Reversal: each primitive is a file in this repository, not a package import. Replacing one means
editing it. Removing ShadCN entirely means deleting `src/ui/primitives/`, the bridge, and six
dependencies; nothing outside those files knows ShadCN exists.
