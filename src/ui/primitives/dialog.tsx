"use client"

import * as React from "react"
import { cn } from "@/ui/cn.ts"
import { XIcon } from "lucide-react"
import { Dialog as DialogPrimitive } from "radix-ui"

import { Button } from "@/ui/Button.tsx"

function Dialog({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

/**
 * The scrim.
 *
 * Stock is a 50% black wash, which measures 1.08:1 against the dark app ground — in dark it dims
 * nothing, and the dialog floats over a page that still looks fully live. Mixing towards
 * `--steel-950` instead suppresses what is actually bright behind the dialog in both themes: the
 * text, the chips and the card grounds all collapse towards the darkest step in the ramp. Paired
 * with `--elev-3` on the content (a ring in dark, a shadow in light — "seams, not shadows",
 * design §5.3) the dialog reads as raised on either theme.
 *
 * `data-motion="fade"` opts the overlay back into a 100ms opacity cross-fade under
 * `prefers-reduced-motion` — permitted by design §8, which bans transforms there but not opacity.
 */
function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      data-motion="fade"
      className={cn(
        "fixed inset-0 z-50 bg-[var(--scrim)] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0",
        className
      )}
      {...props}
    />
  )
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  closeLabel = "Close",
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean
  /**
   * The product ships English, Hindi and Kannada, so a primitive must not hard-code a word a
   * customer or a cook will read — including one only a screen reader reads. Every caller on a
   * translated surface passes `t('common.close')`; the English default exists only so an
   * untranslated internal screen still renders.
   */
  closeLabel?: string
}) {
  return (
    <DialogPortal data-slot="dialog-portal">
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          // `bg-popover` is --bg-raised: white over the steel app ground in light, steel-800 over
          // steel-950 in dark. Stock used the page-background role, the *same* colour as the page it covers.
          "fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-var(--space-32))] translate-x-[-50%] translate-y-[-50%] gap-[var(--space-16)] rounded-xl border bg-popover p-[var(--space-24)] text-popover-foreground shadow-[var(--elev-3)] duration-[var(--dur-4)] outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 sm:max-w-lg",
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            className={cn(
              // Not a 70% glyph that fades up to 100% on hover: opacity is not an affordance here
              // a 16px glyph is not a target. Design §6.1 floors, §11.10 on opacity.
              "absolute top-[var(--space-16)] right-[var(--space-16)] inline-flex items-center justify-center rounded-[var(--radius-2)] text-[var(--text-secondary)] outline-hidden transition-colors duration-[var(--dur-2)]",
              "min-h-[var(--touch-min)] min-w-[var(--touch-min)] [[data-density=counter]_&]:min-h-[var(--touch-counter)] [[data-density=counter]_&]:min-w-[var(--touch-counter)] [[data-density=dense]_&]:min-h-[var(--touch-dense)] [[data-density=dense]_&]:min-w-[var(--touch-dense)]",
              "hover:bg-accent hover:text-[var(--text-primary)]",
              "disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-[var(--bg-sunken)] disabled:text-[var(--text-disabled)]",
              "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-[var(--space-16)]"
            )}
          >
            <XIcon />
            <span className="sr-only">{closeLabel}</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn(
        "flex flex-col gap-[var(--space-8)] text-center sm:text-left",
        className
      )}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  closeLabel = "Close",
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
  /**
   * The product ships English, Hindi and Kannada, so a primitive must not hard-code a word a
   * customer or a cook will read. Every caller on a translated surface passes
   * `t('common.close')`; the English default exists only so an untranslated internal screen
   * still renders.
   */
  closeLabel?: string
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-[var(--space-8)] sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close asChild>
          <Button variant="ghost">{closeLabel}</Button>
        </DialogPrimitive.Close>
      )}
    </div>
  )
}

/**
 * A 1.0 line-height clips Devanagari matras and Kannada below-base forms, and weight 600 is one
 * neither script has a reliable system face for. Design §4.2 rules 1 and 4.
 */
function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(
        "text-[length:var(--text-title)] leading-[var(--lh-ui)] font-[weight:var(--fw-bold)]",
        className
      )}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "text-[length:var(--text-body)] leading-[var(--lh-body)] font-[weight:var(--fw-regular)] text-muted-foreground",
        className
      )}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
