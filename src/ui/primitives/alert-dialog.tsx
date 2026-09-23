"use client"

import * as React from "react"
import { cn } from "@/ui/cn.ts"
import { AlertDialog as AlertDialogPrimitive } from "radix-ui"

import { Button, type Size as ButtonSize, type Variant as ButtonVariant } from "@/ui/Button.tsx"

function AlertDialog({
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Root>) {
  return <AlertDialogPrimitive.Root data-slot="alert-dialog" {...props} />
}

function AlertDialogTrigger({
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Trigger>) {
  return (
    <AlertDialogPrimitive.Trigger data-slot="alert-dialog-trigger" {...props} />
  )
}

function AlertDialogPortal({
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Portal>) {
  return (
    <AlertDialogPrimitive.Portal data-slot="alert-dialog-portal" {...props} />
  )
}

/**
 * Same scrim as Dialog, for the same reason: a 50% black wash measures 1.08:1 against the dark app
 * ground, so in dark it dimmed nothing at all. Mixing towards `--steel-950` suppresses the text,
 * chips and card grounds behind the dialog in both themes.
 *
 * `data-motion="fade"` restores a 100ms opacity cross-fade under `prefers-reduced-motion` — the
 * one thing design §8 permits there.
 */
function AlertDialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Overlay>) {
  return (
    <AlertDialogPrimitive.Overlay
      data-slot="alert-dialog-overlay"
      data-motion="fade"
      className={cn(
        "fixed inset-0 z-50 bg-[var(--scrim)] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0",
        className
      )}
      {...props}
    />
  )
}

function AlertDialogContent({
  className,
  size = "default",
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Content> & {
  size?: "default" | "sm"
}) {
  return (
    <AlertDialogPortal>
      <AlertDialogOverlay />
      <AlertDialogPrimitive.Content
        data-slot="alert-dialog-content"
        data-size={size}
        className={cn(
          // `bg-popover` is --bg-raised; the stock page-background role was the same colour as the page
          // underneath. `--elev-3` is a ring in dark and a shadow in light (design §5.3).
          "group/alert-dialog-content fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-var(--space-32))] translate-x-[-50%] translate-y-[-50%] gap-[var(--space-16)] rounded-xl border bg-popover p-[var(--space-24)] text-popover-foreground shadow-[var(--elev-3)] duration-[var(--dur-4)] data-[size=sm]:max-w-xs data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[size=default]:sm:max-w-lg",
          className
        )}
        {...props}
      />
    </AlertDialogPortal>
  )
}

function AlertDialogHeader({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-dialog-header"
      className={cn(
        "grid grid-rows-[auto_1fr] place-items-center gap-[var(--space-6)] text-center has-data-[slot=alert-dialog-media]:grid-rows-[auto_auto_1fr] has-data-[slot=alert-dialog-media]:gap-x-[var(--space-24)] sm:group-data-[size=default]/alert-dialog-content:place-items-start sm:group-data-[size=default]/alert-dialog-content:text-left sm:group-data-[size=default]/alert-dialog-content:has-data-[slot=alert-dialog-media]:grid-rows-[auto_1fr]",
        className
      )}
      {...props}
    />
  )
}

function AlertDialogFooter({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-[var(--space-8)] group-data-[size=sm]/alert-dialog-content:grid group-data-[size=sm]/alert-dialog-content:grid-cols-2 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    />
  )
}

/**
 * Weight 600 is a weight the system Devanagari and Kannada faces on a low-end
 * Android synthesise or snap — the same title renders Regular on one handset and Bold on the
 * next. Design §4.2 rule 1: 400 and 700 only for anything translatable.
 */
function AlertDialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Title>) {
  return (
    <AlertDialogPrimitive.Title
      data-slot="alert-dialog-title"
      className={cn(
        "text-[length:var(--text-title)] leading-[var(--lh-ui)] font-[weight:var(--fw-bold)] sm:group-data-[size=default]/alert-dialog-content:group-has-data-[slot=alert-dialog-media]/alert-dialog-content:col-start-2",
        className
      )}
      {...props}
    />
  )
}

function AlertDialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Description>) {
  return (
    <AlertDialogPrimitive.Description
      data-slot="alert-dialog-description"
      className={cn(
        "text-[length:var(--text-body)] leading-[var(--lh-body)] font-[weight:var(--fw-regular)] text-muted-foreground",
        className
      )}
      {...props}
    />
  )
}

function AlertDialogMedia({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-dialog-media"
      className={cn(
        "mb-[var(--space-8)] inline-flex size-[var(--space-64)] items-center justify-center rounded-md bg-muted sm:group-data-[size=default]/alert-dialog-content:row-span-2 *:[svg:not([class*='size-'])]:size-[var(--space-32)]",
        className
      )}
      {...props}
    />
  )
}

/**
 * The confirm control.
 *
 * Defaults to the steel plate, not to red. Design §11.1 isolates destruction: a dialog asking
 * "print these cards?" and one asking "delete this menu item?" are the same component, and only
 * the second earns `variant="danger"`. Making every confirm red teaches staff to ignore red.
 *
 * `asChild` is on the Radix primitive rather than on Button — Button renders a real `<button>` or
 * `<a>` and has no Slot, so the primitive is the one that steps aside.
 */
function AlertDialogAction({
  className,
  children,
  variant = "primary",
  size,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Action> & {
  variant?: ButtonVariant
  size?: ButtonSize
}) {
  return (
    <AlertDialogPrimitive.Action data-slot="alert-dialog-action" asChild {...props}>
      <Button variant={variant} {...(size ? { size } : {})} {...(className ? { className } : {})}>
        {children}
      </Button>
    </AlertDialogPrimitive.Action>
  )
}

function AlertDialogCancel({
  className,
  children,
  variant = "ghost",
  size,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Cancel> & {
  variant?: ButtonVariant
  size?: ButtonSize
}) {
  return (
    <AlertDialogPrimitive.Cancel data-slot="alert-dialog-cancel" asChild {...props}>
      <Button variant={variant} {...(size ? { size } : {})} {...(className ? { className } : {})}>
        {children}
      </Button>
    </AlertDialogPrimitive.Cancel>
  )
}

export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogTitle,
  AlertDialogTrigger,
}
