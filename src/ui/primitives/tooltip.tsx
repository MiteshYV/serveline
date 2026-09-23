"use client"

import * as React from "react"
import { cn } from "@/ui/cn.ts"
import { Tooltip as TooltipPrimitive } from "radix-ui"

function TooltipProvider({
  delayDuration = 0,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delayDuration={delayDuration}
      {...props}
    />
  )
}

function Tooltip({
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />
}

function TooltipTrigger({
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />
}

/**
 * Stock's extra-small step is a fixed 12px that ignores all three density modes; `--text-caption` is 13 on the
 * customer surface, 14 at the counter (the hard floor in design §4.4) and 12 in the agent
 * console. `--lh-ui` is stated rather than inherited because a tooltip is translatable and
 * anything under 1.45 clips Devanagari matras and Kannada below-base forms.
 *
 * A tooltip is never the only carrier of a meaning (design §3.3) — it is hover- and focus-only,
 * so whatever it says must also be in the label or an `aria-label`.
 */
function TooltipContent({
  className,
  sideOffset = 0,
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        className={cn(
          "z-50 w-fit origin-(--radix-tooltip-content-transform-origin) animate-in rounded-sm bg-foreground px-[var(--space-12)] py-[var(--space-6)] text-[length:var(--text-caption)] leading-[var(--lh-ui)] font-[weight:var(--fw-regular)] text-balance text-background fade-in-0 zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
          className
        )}
        {...props}
      >
        {children}
        <TooltipPrimitive.Arrow className="z-50 size-[var(--space-8)] translate-y-[calc(-50%_-_var(--space-2))] rotate-45 rounded-[var(--radius-1)] bg-foreground fill-foreground" />
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  )
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
