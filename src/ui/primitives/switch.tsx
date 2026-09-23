"use client"

import * as React from "react"
import { cn } from "@/ui/cn.ts"
import { Switch as SwitchPrimitive } from "radix-ui"

/**
 * A two-state toggle.
 *
 * Stock ShadCN draws this as an 18px pill. Three things were wrong with that here:
 *
 * 1. **18px is not a target.** WCAG 2.2 SC 2.5.8 floors at 24×24 and this product floors well
 *    above it — 44px customer, 56px counter, 32px agent console (design §6.1). The Root is now
 *    the target and carries the floor; the visible track sits inside it. A cook with a wet finger
 *    gets the whole 44px, not the 18px of enamel they can see.
 * 2. **A full radius is a pill.** Plates, not pills — `--radius-full` is reserved by the design
 *    language for avatars and count badges (§5.2). The track is `--radius-2`, the thumb
 *    `--radius-1`.
 * 3. **A 50% opacity for disabled is banned by §11.10.** Disabled is the explicit pair instead: the
 *    thumb drops to `--text-disabled`, the track to `--bg-sunken`, and the border really changes
 *    to `--border-subtle` so the control reads as inert rather than faded.
 *
 * The three disabled declarations are important, and that is load-bearing rather than lazy: the
 * checked rules below set the same three properties, and Tailwind emits `data-*` variants after
 * pseudo-class ones at equal specificity. Without the `!` a *disabled and checked* switch won the
 * cascade with the action fill and read as a live, tappable ON — which is precisely the state the
 * §11.10 pair exists to make unmistakable.
 *
 * State is never carried by colour alone: the thumb's *position* is the primary encoding and it
 * survives monochrome, a greasy screen and a 65 cm glance.
 */
function Switch({
  className,
  size = "default",
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root> & {
  size?: "sm" | "default"
}) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(
        "peer group/switch inline-flex shrink-0 items-center justify-center bg-transparent p-0 outline-none",
        "min-h-[var(--touch-min)] min-w-[var(--touch-min)]",
        "[[data-density=counter]_&]:min-h-[var(--touch-counter)] [[data-density=counter]_&]:min-w-[var(--touch-counter)]",
        "[[data-density=dense]_&]:min-h-[var(--touch-dense)] [[data-density=dense]_&]:min-w-[var(--touch-dense)]",
        "disabled:cursor-not-allowed",
        className
      )}
      {...props}
    >
      <span
        data-slot="switch-track"
        className={cn(
          "pointer-events-none flex items-center rounded-[var(--radius-2)] border p-[var(--space-2)]",
          "transition-colors duration-[var(--dur-1)] ease-[var(--ease-snap)]",
          "border-input bg-[var(--bg-sunken)]",
          "group-data-[size=default]/switch:h-[var(--space-24)] group-data-[size=default]/switch:w-[var(--space-40)]",
          "group-data-[size=sm]/switch:h-[var(--space-20)] group-data-[size=sm]/switch:w-[var(--space-32)]",
          "group-data-[state=checked]/switch:border-[color:var(--action-fill)] group-data-[state=checked]/switch:bg-primary",
          "group-disabled/switch:border-[color:var(--border-subtle)]! group-disabled/switch:bg-[var(--bg-sunken)]!"
        )}
      >
        <SwitchPrimitive.Thumb
          data-slot="switch-thumb"
          className={cn(
            "pointer-events-none block rounded-[var(--radius-1)] bg-[var(--border-strong)]",
            "transition-transform duration-[var(--dur-1)] ease-[var(--ease-snap)]",
            "group-data-[size=default]/switch:size-[var(--space-16)]",
            "group-data-[size=sm]/switch:size-[var(--space-12)]",
            "group-data-[state=unchecked]/switch:translate-x-0",
            "group-data-[state=checked]/switch:translate-x-[calc(100%+var(--space-2))] group-data-[state=checked]/switch:bg-primary-foreground",
            "group-disabled/switch:bg-[var(--text-disabled)]!"
          )}
        />
      </span>
    </SwitchPrimitive.Root>
  )
}

export { Switch }
