"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/ui/cn.ts"
import { Tabs as TabsPrimitive } from "radix-ui"

function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      orientation={orientation}
      className={cn(
        "group/tabs flex gap-[var(--space-8)] data-[orientation=horizontal]:flex-col",
        className
      )}
      {...props}
    />
  )
}

/**
 * The track. Its height comes from the triggers now rather than a fixed 36px, because the
 * triggers carry the product's touch floors and a 36px track cannot hold a 44px target.
 */
const tabsListVariants = cva(
  "group/tabs-list inline-flex w-fit items-center justify-center rounded-lg p-[var(--space-2)] group-data-[orientation=vertical]/tabs:h-fit group-data-[orientation=vertical]/tabs:flex-col data-[variant=line]:rounded-none",
  {
    variants: {
      variant: {
        default: "bg-muted",
        line: "gap-[var(--space-4)] bg-transparent",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function TabsList({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> &
  VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  )
}

/**
 * Four fixes against stock ShadCN, each a measured finding:
 *
 * 1. **The inactive label was a 60% alpha on the foreground role — 3.99:1, under the 4.5 floor.** An alpha on a
 *    token is a new colour nobody computed. `--text-secondary` is the ramp step that clears every
 *    ground the list can sit on (6.70 card / 5.90 app / 5.37 sunken). Not `--text-tertiary`: that
 *    one is card-only and this track is `--bg-sunken`.
 * 2. **36px is below the floor.** The fixed height is gone; the trigger reads `--touch-min` and steps to
 *    `--touch-counter` or `--touch-dense` with the surface's density (design §6.1).
 * 3. **Weight 500 on a translatable label.** 500 has no reliable system face in Devanagari or
 *    Kannada. Active is `--fw-bold`, inactive `--fw-regular` — which also makes selection legible
 *    without colour, alongside the ground change and the underline.
 * 4. **The 50% disabled opacity** replaced by the explicit disabled pair (§11.10). Those three
 *    declarations are important because `data-[state=active]` sets the same properties and is
 *    emitted after `disabled:` at equal specificity — a disabled *selected* tab otherwise drew
 *    itself as fully active, with no disabled affordance at all.
 *
 * Every `dark:` utility is deleted rather than fixed: tokens.css already re-points these roles,
 * so a second rule for dark is a second source of truth (ADR 0008).
 */
function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "relative inline-flex flex-1 items-center justify-center gap-[var(--space-6)] rounded-md border border-transparent px-[var(--space-8)] py-[var(--space-4)] whitespace-nowrap",
        "min-h-[var(--touch-min)] [[data-density=counter]_&]:min-h-[var(--touch-counter)] [[data-density=dense]_&]:min-h-[var(--touch-dense)]",
        "text-[length:var(--text-label)] leading-[var(--lh-ui)] font-[weight:var(--fw-regular)] text-[var(--text-secondary)]",
        "transition-colors duration-[var(--dur-2)] outline-none hover:text-[var(--text-primary)]",
        "group-data-[orientation=vertical]/tabs:w-full group-data-[orientation=vertical]/tabs:justify-start",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:border-[color:var(--border-subtle)]! disabled:bg-[var(--bg-sunken)]! disabled:text-[var(--text-disabled)]!",
        "data-[state=active]:bg-[var(--bg-card)] data-[state=active]:font-[weight:var(--fw-bold)] data-[state=active]:text-[var(--text-primary)]",
        "group-data-[variant=default]/tabs-list:data-[state=active]:shadow-[var(--elev-1)]",
        "group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:data-[state=active]:bg-transparent group-data-[variant=line]/tabs-list:data-[state=active]:shadow-none",
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-[var(--space-16)]",
        "after:absolute after:bg-[var(--text-primary)] after:opacity-0 after:transition-opacity after:duration-[var(--dur-2)] group-data-[orientation=horizontal]/tabs:after:inset-x-0 group-data-[orientation=horizontal]/tabs:after:bottom-[calc(var(--space-2)*-1)] group-data-[orientation=horizontal]/tabs:after:h-[var(--space-2)] group-data-[orientation=vertical]/tabs:after:inset-y-0 group-data-[orientation=vertical]/tabs:after:right-[calc(var(--space-4)*-1)] group-data-[orientation=vertical]/tabs:after:w-[var(--space-2)] group-data-[variant=line]/tabs-list:data-[state=active]:after:opacity-100",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("flex-1 outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants }
