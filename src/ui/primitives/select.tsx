"use client"

import * as React from "react"
import { cn } from "@/ui/cn.ts"
import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from "lucide-react"
import { Select as SelectPrimitive } from "radix-ui"

function Select({
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Root>) {
  return <SelectPrimitive.Root data-slot="select" {...props} />
}

function SelectGroup({
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Group>) {
  return <SelectPrimitive.Group data-slot="select-group" {...props} />
}

function SelectValue({
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Value>) {
  return <SelectPrimitive.Value data-slot="select-value" {...props} />
}

/**
 * `size` no longer sets the height. Stock ShadCN gave this a fixed 36 / 32px height, under the
 * 44px customer floor and well under the 56px counter floor (design §6.1). Height now comes from
 * the touch tokens and steps with the surface's density; `size="sm"` tightens the padding only.
 *
 * Disabled is the explicit pair rather than a 50% opacity (§11.10): `--text-disabled` on
 * `--bg-sunken` with the border really changing to `--border-subtle`, so a disabled field reads
 * as inert instead of faded. The `dark:` utilities are gone — tokens.css already re-points these
 * roles, and a `dark:` rule inside a primitive is a second source of truth (ADR 0008).
 */
function SelectTrigger({
  className,
  size = "default",
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Trigger> & {
  size?: "sm" | "default"
}) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      data-size={size}
      className={cn(
        "flex w-fit items-center justify-between gap-[var(--space-8)] rounded-md border border-input bg-transparent whitespace-nowrap outline-none",
        "min-h-[var(--touch-min)] [[data-density=counter]_&]:min-h-[var(--touch-counter)] [[data-density=dense]_&]:min-h-[var(--touch-dense)]",
        "text-[length:var(--text-body)] leading-[var(--lh-ui)] font-[weight:var(--fw-regular)]",
        "transition-[color,background-color,border-color] duration-[var(--dur-2)]",
        "data-[size=default]:px-[var(--space-12)] data-[size=default]:py-[var(--space-8)]",
        "data-[size=sm]:px-[var(--space-8)] data-[size=sm]:py-[var(--space-6)]",
        "data-[placeholder]:text-muted-foreground",
        "disabled:cursor-not-allowed disabled:border-[color:var(--border-subtle)] disabled:bg-[var(--bg-sunken)] disabled:text-[var(--text-disabled)]",
        "aria-invalid:border-[color:var(--state-attention-ink)]",
        "*:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-[var(--space-8)]",
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-[var(--space-16)] [&_svg:not([class*='text-'])]:text-muted-foreground",
        className
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        {/* Not a 50% opacity: a faded glyph is a new contrast ratio nobody computed. */}
        <ChevronDownIcon className="size-[var(--space-16)] text-muted-foreground" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  )
}

function SelectContent({
  className,
  children,
  position = "item-aligned",
  align = "center",
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Content>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        data-slot="select-content"
        className={cn(
          // --elev-2 is a ring in dark and a tight shadow in light ("seams, not shadows",
          // design §5.3). The stock medium shadow had no token behind it and left the panel edgeless in dark.
          "relative z-50 max-h-(--radix-select-content-available-height) min-w-[8rem] origin-(--radix-select-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-lg border bg-popover text-popover-foreground shadow-[var(--elev-2)] data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
          position === "popper" &&
            "data-[side=bottom]:translate-y-[var(--space-4)] data-[side=left]:translate-x-[calc(var(--space-4)*-1)] data-[side=right]:translate-x-[var(--space-4)] data-[side=top]:translate-y-[calc(var(--space-4)*-1)]",
          className
        )}
        position={position}
        align={align}
        {...props}
      >
        <SelectScrollUpButton />
        <SelectPrimitive.Viewport
          className={cn(
            "p-[var(--space-4)]",
            position === "popper" &&
              "h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)] scroll-my-[var(--space-4)]"
          )}
        >
          {children}
        </SelectPrimitive.Viewport>
        <SelectScrollDownButton />
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  )
}

function SelectLabel({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Label>) {
  return (
    <SelectPrimitive.Label
      data-slot="select-label"
      className={cn(
        "px-[var(--space-8)] py-[var(--space-6)] text-[length:var(--text-caption)] leading-[var(--lh-ui)] font-[weight:var(--fw-bold)] text-muted-foreground",
        className
      )}
      {...props}
    />
  )
}

function SelectItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "relative flex w-full cursor-default items-center gap-[var(--space-8)] rounded-sm py-[var(--space-6)] pr-[var(--space-32)] pl-[var(--space-8)] outline-hidden select-none",
        "min-h-[var(--touch-min)] [[data-density=counter]_&]:min-h-[var(--touch-counter)] [[data-density=dense]_&]:min-h-[var(--touch-dense)]",
        "text-[length:var(--text-label)] leading-[var(--lh-ui)] font-[weight:var(--fw-regular)]",
        "focus:bg-accent focus:text-accent-foreground",
        "data-[disabled]:pointer-events-none data-[disabled]:cursor-not-allowed data-[disabled]:bg-[var(--bg-sunken)] data-[disabled]:text-[var(--text-disabled)]",
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-[var(--space-16)] [&_svg:not([class*='text-'])]:text-muted-foreground *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-[var(--space-8)]",
        className
      )}
      {...props}
    >
      <span
        data-slot="select-item-indicator"
        className="absolute right-[var(--space-8)] flex size-[var(--space-16)] items-center justify-center"
      >
        <SelectPrimitive.ItemIndicator>
          <CheckIcon className="size-[var(--space-16)]" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  )
}

function SelectSeparator({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Separator>) {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={cn(
        "pointer-events-none mx-[calc(var(--space-4)*-1)] my-[var(--space-4)] h-px bg-border",
        className
      )}
      {...props}
    />
  )
}

function SelectScrollUpButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollUpButton>) {
  return (
    <SelectPrimitive.ScrollUpButton
      data-slot="select-scroll-up-button"
      className={cn(
        "flex cursor-default items-center justify-center py-[var(--space-4)]",
        className
      )}
      {...props}
    >
      <ChevronUpIcon className="size-[var(--space-16)]" />
    </SelectPrimitive.ScrollUpButton>
  )
}

function SelectScrollDownButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollDownButton>) {
  return (
    <SelectPrimitive.ScrollDownButton
      data-slot="select-scroll-down-button"
      className={cn(
        "flex cursor-default items-center justify-center py-[var(--space-4)]",
        className
      )}
      {...props}
    >
      <ChevronDownIcon className="size-[var(--space-16)]" />
    </SelectPrimitive.ScrollDownButton>
  )
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
}
