"use client"

import type { CSSProperties } from "react"
import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { Toaster as Sonner, type ToasterProps } from "sonner"

/**
 * Transient confirmations — "payment link sent", "menu published".
 *
 * Two departures from the generated ShadCN version, both deliberate:
 *
 * 1. No `theme` prop and no `next-themes`. The toast portals into `<body>`, so it already sits
 *    under the same `[data-theme]` as everything else and its tokens flip with the page. A second
 *    theme source is a second way for light and dark to disagree — which is the bug this pass
 *    exists to remove, not to add.
 *
 * 2. The variables below point at Steel & Enamel tokens rather than ShadCN's `--popover` family.
 *    Those names are bridged through `@theme inline` for Tailwind utilities; they are not real
 *    custom properties at runtime, so sonner — which reads them as inline styles — would have
 *    resolved every one of them to nothing.
 *
 * Every variant keeps an icon. "Never colour alone": a toast that says something went wrong must
 * still say so with a glyph and a word, because a cook glancing at a counter tablet from an angle
 * reads shape long before hue.
 */
function Toaster({ ...props }: ToasterProps) {
  return (
    <Sonner
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" aria-hidden />,
        info: <InfoIcon className="size-4" aria-hidden />,
        warning: <TriangleAlertIcon className="size-4" aria-hidden />,
        error: <OctagonXIcon className="size-4" aria-hidden />,
        loading: <Loader2Icon className="size-4 animate-spin" aria-hidden />,
      }}
      style={
        {
          "--normal-bg": "var(--bg-raised)",
          "--normal-text": "var(--text-primary)",
          "--normal-border": "var(--border-separator)",
          "--success-bg": "var(--state-ready-wash)",
          "--success-text": "var(--state-ready-ink)",
          "--success-border": "var(--state-ready-ink)",
          "--error-bg": "var(--state-attention-wash)",
          "--error-text": "var(--state-attention-ink)",
          "--error-border": "var(--state-attention-ink)",
          "--warning-bg": "var(--state-preparing-wash)",
          "--warning-text": "var(--state-preparing-ink)",
          "--warning-border": "var(--state-preparing-ink)",
          "--info-bg": "var(--state-received-wash)",
          "--info-text": "var(--state-received-ink)",
          "--info-border": "var(--state-received-ink)",
          "--border-radius": "var(--radius-4)",
        } as CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
