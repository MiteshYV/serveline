"use client"

import * as React from "react"
import { cn } from "@/ui/cn.ts"
import { Label as LabelPrimitive } from "radix-ui"

/**
 * A field label.
 *
 * Three departures from stock ShadCN, all from the design language:
 *
 * 1. **No 50% opacity for disabled.** Design §11.10 bans opacity as the disabled affordance by
 *    name — it fades the label and whatever shows through it at once, and a half-transparent
 *    string is unreadable rather than obviously inert. The explicit `--text-disabled` pair says
 *    the same thing at a known contrast. (SC 1.4.3 exempts the label of an inactive control.)
 * 2. **Weight 400/700 only.** Stock's medium is weight 500, and the system Devanagari and Kannada faces
 *    on a low-end Android have no reliable synthetic medium — a "medium" label is Regular on one
 *    handset and Bold on the next. Design §4.2 rule 1.
 * 3. **No 1.0 line-height.** Devanagari matras sit above the shirorekha and Kannada has below-base
 *    forms; anything under 1.45 clips them. Design §4.2 rule 4.
 */
function Label({
  className,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        "flex items-center gap-[var(--space-8)] select-none",
        "text-[length:var(--text-label)] leading-[var(--lh-ui)] font-[weight:var(--fw-bold)]",
        "group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:cursor-not-allowed group-data-[disabled=true]:text-[var(--text-disabled)]",
        "peer-disabled:cursor-not-allowed peer-disabled:text-[var(--text-disabled)]",
        className
      )}
      {...props}
    />
  )
}

export { Label }
