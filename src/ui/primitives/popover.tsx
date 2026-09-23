"use client"

import * as React from "react"
import { cn } from "@/ui/cn.ts"
import { Popover as PopoverPrimitive } from "radix-ui"

function Popover({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />
}

function PopoverTrigger({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />
}

function PopoverContent({
  className,
  align = "center",
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        align={align}
        sideOffset={sideOffset}
        className={cn(
          // The stock medium shadow had no token behind it, so on the dark ground this panel had no
          // perceivable edge at all. --elev-2 is design §5.3's "dropdowns, sheets, popovers"
          // step: a tight shadow in light, a 1px seam in dark.
          "z-50 w-72 origin-(--radix-popover-content-transform-origin) rounded-lg border bg-popover p-[var(--space-16)] text-popover-foreground shadow-[var(--elev-2)] outline-hidden data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
          className
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  )
}

function PopoverAnchor({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Anchor>) {
  return <PopoverPrimitive.Anchor data-slot="popover-anchor" {...props} />
}

function PopoverHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="popover-header"
      className={cn("flex flex-col gap-[var(--space-4)]", className)}
      {...props}
    />
  )
}

/**
 * Weight 500 is what stock uses, and the system Devanagari and Kannada faces on a low-end Android
 * synthesise or snap — the same title is Regular on one handset and Bold on the next. Design
 * §4.2 rule 1 reserves 500/600 for Latin-only content.
 */
function PopoverTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return (
    <div
      data-slot="popover-title"
      className={cn(
        "text-[length:var(--text-body)] leading-[var(--lh-ui)] font-[weight:var(--fw-bold)]",
        className
      )}
      {...props}
    />
  )
}

function PopoverDescription({
  className,
  ...props
}: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="popover-description"
      className={cn(
        "text-[length:var(--text-body)] leading-[var(--lh-body)] font-[weight:var(--fw-regular)] text-muted-foreground",
        className
      )}
      {...props}
    />
  )
}

export {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverAnchor,
  PopoverHeader,
  PopoverTitle,
  PopoverDescription,
}
