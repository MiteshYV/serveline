"use client"

import * as React from "react"
import { cn } from "@/ui/cn.ts"
import { CheckIcon, ChevronRightIcon, CircleIcon } from "lucide-react"
import { DropdownMenu as DropdownMenuPrimitive } from "radix-ui"

/**
 * Every menu row in this file shares three rules, so they are stated once here rather than in
 * four near-identical comments:
 *
 * - **Height comes from the touch tokens**, not from padding. A 36px row is under the 44px
 *   customer floor and well under the 56px counter floor; design §6.3 puts "Cancel order" behind
 *   exactly this menu, on a phone propped at a counter and tapped with a greasy finger.
 * - **Disabled is the explicit pair, never opacity** (§11.10): `--text-disabled` on `--bg-sunken`.
 * - **Labels are 400 or 700 and never 500/600**, and never tighter than `--lh-ui` — Devanagari
 *   and Kannada have no reliable system medium and clip below 1.45 (§4.2).
 */
const MENU_ROW = [
  "relative flex cursor-default items-center gap-[var(--space-8)] rounded-sm outline-hidden select-none",
  "min-h-[var(--touch-min)] [[data-density=counter]_&]:min-h-[var(--touch-counter)] [[data-density=dense]_&]:min-h-[var(--touch-dense)]",
  "text-[length:var(--text-label)] leading-[var(--lh-ui)] font-[weight:var(--fw-regular)]",
  "focus:bg-accent focus:text-accent-foreground",
  "data-[disabled]:pointer-events-none data-[disabled]:cursor-not-allowed data-[disabled]:bg-[var(--bg-sunken)] data-[disabled]:text-[var(--text-disabled)]",
  "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-[var(--space-16)]",
].join(" ")

function DropdownMenu({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Root>) {
  return <DropdownMenuPrimitive.Root data-slot="dropdown-menu" {...props} />
}

function DropdownMenuPortal({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Portal>) {
  return (
    <DropdownMenuPrimitive.Portal data-slot="dropdown-menu-portal" {...props} />
  )
}

function DropdownMenuTrigger({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Trigger>) {
  return (
    <DropdownMenuPrimitive.Trigger
      data-slot="dropdown-menu-trigger"
      {...props}
    />
  )
}

function DropdownMenuContent({
  className,
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        data-slot="dropdown-menu-content"
        sideOffset={sideOffset}
        className={cn(
          // --elev-2 is a ring in dark and a tight shadow in light. The stock medium shadow had no token
          // behind it and left the menu with no perceivable edge on the dark ground.
          "z-50 max-h-(--radix-dropdown-menu-content-available-height) min-w-[8rem] origin-(--radix-dropdown-menu-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-lg border bg-popover p-[var(--space-4)] text-popover-foreground shadow-[var(--elev-2)] data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
          className
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  )
}

function DropdownMenuGroup({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Group>) {
  return (
    <DropdownMenuPrimitive.Group data-slot="dropdown-menu-group" {...props} />
  )
}

/**
 * `variant="destructive"` reads `--state-attention-ink`, not `--color-destructive`. The bridge
 * points `destructive` at `--state-attention-plate`, which is the *fill* of a chip; the design
 * gives text and icons the `ink` step, which is the one measured against both the card and the
 * app ground (9.20 / 8.10 light, 8.34 / 9.35 dark). Focus takes the matching `wash` rather than
 * an alpha of the plate — an alpha is a new colour nobody computed.
 */
function DropdownMenuItem({
  className,
  inset,
  variant = "default",
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Item> & {
  inset?: boolean
  variant?: "default" | "destructive"
}) {
  return (
    <DropdownMenuPrimitive.Item
      data-slot="dropdown-menu-item"
      data-inset={inset}
      data-variant={variant}
      className={cn(
        MENU_ROW,
        "px-[var(--space-8)] py-[var(--space-6)] data-[inset]:pl-[var(--space-32)]",
        "[&_svg:not([class*='text-'])]:text-muted-foreground",
        "data-[variant=destructive]:text-[var(--state-attention-ink)] data-[variant=destructive]:focus:bg-[var(--state-attention-wash)] data-[variant=destructive]:focus:text-[var(--state-attention-ink)] data-[variant=destructive]:*:[svg]:text-[var(--state-attention-ink)]!",
        className
      )}
      {...props}
    />
  )
}

function DropdownMenuCheckboxItem({
  className,
  children,
  checked,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.CheckboxItem>) {
  return (
    <DropdownMenuPrimitive.CheckboxItem
      data-slot="dropdown-menu-checkbox-item"
      className={cn(
        MENU_ROW,
        "py-[var(--space-6)] pr-[var(--space-8)] pl-[var(--space-32)]",
        className
      )}
      checked={checked}
      {...props}
    >
      <span className="pointer-events-none absolute left-[var(--space-8)] flex size-[var(--space-16)] items-center justify-center">
        <DropdownMenuPrimitive.ItemIndicator>
          <CheckIcon className="size-[var(--space-16)]" />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.CheckboxItem>
  )
}

function DropdownMenuRadioGroup({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.RadioGroup>) {
  return (
    <DropdownMenuPrimitive.RadioGroup
      data-slot="dropdown-menu-radio-group"
      {...props}
    />
  )
}

function DropdownMenuRadioItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.RadioItem>) {
  return (
    <DropdownMenuPrimitive.RadioItem
      data-slot="dropdown-menu-radio-item"
      className={cn(
        MENU_ROW,
        "py-[var(--space-6)] pr-[var(--space-8)] pl-[var(--space-32)]",
        className
      )}
      {...props}
    >
      <span className="pointer-events-none absolute left-[var(--space-8)] flex size-[var(--space-16)] items-center justify-center">
        <DropdownMenuPrimitive.ItemIndicator>
          <CircleIcon className="size-[var(--space-8)] fill-current" />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.RadioItem>
  )
}

function DropdownMenuLabel({
  className,
  inset,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Label> & {
  inset?: boolean
}) {
  return (
    <DropdownMenuPrimitive.Label
      data-slot="dropdown-menu-label"
      data-inset={inset}
      className={cn(
        "px-[var(--space-8)] py-[var(--space-6)] text-[length:var(--text-caption)] leading-[var(--lh-ui)] font-[weight:var(--fw-bold)] text-muted-foreground data-[inset]:pl-[var(--space-32)]",
        className
      )}
      {...props}
    />
  )
}

function DropdownMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return (
    <DropdownMenuPrimitive.Separator
      data-slot="dropdown-menu-separator"
      className={cn(
        "mx-[calc(var(--space-4)*-1)] my-[var(--space-4)] h-px bg-border",
        className
      )}
      {...props}
    />
  )
}

/**
 * Latin-only by construction (a keyboard shortcut), but the widest tracking step is 0.1em — five times
 * the 0.02em cap design §4.2 rule 2 allows even on Latin micro-labels, and it breaks conjuncts
 * outright if anything translatable ever lands here. Dropped rather than reduced.
 */
function DropdownMenuShortcut({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="dropdown-menu-shortcut"
      className={cn(
        "ml-auto text-[length:var(--text-caption)] leading-[var(--lh-ui)] text-muted-foreground",
        className
      )}
      {...props}
    />
  )
}

function DropdownMenuSub({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Sub>) {
  return <DropdownMenuPrimitive.Sub data-slot="dropdown-menu-sub" {...props} />
}

function DropdownMenuSubTrigger({
  className,
  inset,
  children,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.SubTrigger> & {
  inset?: boolean
}) {
  return (
    <DropdownMenuPrimitive.SubTrigger
      data-slot="dropdown-menu-sub-trigger"
      data-inset={inset}
      className={cn(
        MENU_ROW,
        "px-[var(--space-8)] py-[var(--space-6)] data-[inset]:pl-[var(--space-32)]",
        "data-[state=open]:bg-accent data-[state=open]:text-accent-foreground",
        "[&_svg:not([class*='text-'])]:text-muted-foreground",
        className
      )}
      {...props}
    >
      {children}
      <ChevronRightIcon className="ml-auto size-[var(--space-16)]" />
    </DropdownMenuPrimitive.SubTrigger>
  )
}

function DropdownMenuSubContent({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.SubContent>) {
  return (
    <DropdownMenuPrimitive.SubContent
      data-slot="dropdown-menu-sub-content"
      className={cn(
        "z-50 min-w-[8rem] origin-(--radix-dropdown-menu-content-transform-origin) overflow-hidden rounded-lg border bg-popover p-[var(--space-4)] text-popover-foreground shadow-[var(--elev-2)] data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
        className
      )}
      {...props}
    />
  )
}

export {
  DropdownMenu,
  DropdownMenuPortal,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
}
