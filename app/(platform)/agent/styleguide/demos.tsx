'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import type { OrderStatus } from '@/core/orders.ts'
import type { Lang } from '@/ui/i18n.ts'
import { MenuItemRow, type MenuItemView } from '@/ui/MenuItemRow.tsx'
import { OrderCard, type OrderCardData } from '@/ui/OrderCard.tsx'
import { QtyStepper } from '@/ui/QtyStepper.tsx'
import { ResendOtp } from '@/ui/OtpInput.tsx'
import { Button } from '@/ui/Button.tsx'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/ui/primitives/alert-dialog.tsx'
import {
  Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
  DialogTrigger,
} from '@/ui/primitives/dialog.tsx'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/ui/primitives/dropdown-menu.tsx'
import { Label } from '@/ui/primitives/label.tsx'
import {
  Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger,
} from '@/ui/primitives/popover.tsx'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/primitives/select.tsx'
import { Toaster } from '@/ui/primitives/sonner.tsx'
import { Switch } from '@/ui/primitives/switch.tsx'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/ui/primitives/tabs.tsx'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/ui/primitives/tooltip.tsx'

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))


/**
 * An order card with a fake server behind it. `mode` decides what onAction does:
 *  - ok:    resolves after 500ms and the "server" returns the new status
 *  - slow:  resolves after 4s — shows the updating (optimistic, drained button) state
 *  - fail:  rejects after 600ms — shows the failed-to-sync state
 */
export function LiveOrderCard({ order, lang, mode = 'ok' }: { order: OrderCardData; lang: Lang; mode?: 'ok' | 'slow' | 'fail' }) {
  const [current, setCurrent] = useState(order)
  async function onAction(to: OrderStatus) {
    if (mode === 'fail') {
      await wait(600)
      throw new Error('mock: network down')
    }
    await wait(mode === 'slow' ? 4000 : 500)
    setCurrent((o) => ({ ...o, status: to }))
  }
  return (
    <OrderCard
      order={current}
      lang={lang}
      onAction={onAction}
      extraActions={[{ label: 'Mark corrected', onSelect: () => undefined }]}
    />
  )
}

export function StepperDemo({ size, start, max }: { size: 'customer' | 'counter'; start: number; max?: number }) {
  const [qty, setQty] = useState(start)
  return qty === 0 ? (
    <Button variant="ghost" size={size} onClick={() => setQty(1)}>Removed — add again</Button>
  ) : (
    <QtyStepper qty={qty} onChange={setQty} itemName="Paneer Tikka" lang="en" size={size} max={max} />
  )
}

export function MenuDemo({ items, lang }: { items: MenuItemView[]; lang: Lang }) {
  const [cart, setCart] = useState<Record<string, number>>({ 'paneer-tikka': 2 })
  return (
    <ul className="m-0 p-0 list-none rounded-[var(--radius-4)] overflow-hidden">
      {items.map((item) => (
        <MenuItemRow
          key={item.id}
          item={item}
          lang={lang}
          qty={cart[item.id] ?? 0}
          onQtyChange={(q) => setCart((c) => ({ ...c, [item.id]: q }))}
        />
      ))}
    </ul>
  )
}

export function ResendDemo() {
  const [availableAt, setAvailableAt] = useState(() => Date.now() + 30_000)
  return <ResendOtp lang="en" availableAt={availableAt} onResend={() => setAvailableAt(Date.now() + 30_000)} />
}


/* ---------------------------------------------------------------------------
   ShadCN primitives (ADR 0008). They are utility-classed, and every utility they
   touch resolves to a Steel & Enamel token through shadcn-bridge.css — which is
   only true until someone writes one that does not, so they are documented here
   where both themes can be looked at. Imported exactly as they ship; the design
   system does not get a second copy of them.
   --------------------------------------------------------------------------- */

export function SelectDemo() {
  return (
    <Select defaultValue="received">
      <SelectTrigger aria-label="Order status">
        <SelectValue placeholder="Any status" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="received">Received</SelectItem>
        <SelectItem value="preparing">Preparing</SelectItem>
        <SelectItem value="ready">Ready</SelectItem>
        <SelectItem value="delivered">Delivered</SelectItem>
      </SelectContent>
    </Select>
  )
}

export function SwitchDemo() {
  return (
    <span className="inline-flex items-center gap-[var(--space-8)]">
      <Switch id="sg-switch" defaultChecked />
      <Label htmlFor="sg-switch">Order sounds</Label>
    </span>
  )
}

export function TabsDemo() {
  return (
    <Tabs defaultValue="active" className="w-full">
      <TabsList>
        <TabsTrigger value="active">Active</TabsTrigger>
        <TabsTrigger value="done">Done</TabsTrigger>
      </TabsList>
      <TabsContent value="active">Four orders on the board.</TabsContent>
      <TabsContent value="done">Fourteen orders finished today.</TabsContent>
    </Tabs>
  )
}

export function DialogDemo() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="dense" variant="ghost">Print card batch…</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Print 50 table cards?</DialogTitle>
          <DialogDescription>
            Each card carries the QR for one table. Printing does not change the menu or the board.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild><Button size="dense" variant="ghost">Cancel</Button></DialogClose>
          <DialogClose asChild><Button size="dense">Print</Button></DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function AlertDialogDemo() {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="dense" variant="ghost">Delete category…</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete “Starters”?</AlertDialogTitle>
          <AlertDialogDescription>
            The <span className="num">6</span> items in it go too. Deleting cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel size="dense">Keep it</AlertDialogCancel>
          <AlertDialogAction size="dense" variant="danger">Delete category and 6 items</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export function DropdownDemo() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="dense" variant="ghost">More…</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>Order 1284</DropdownMenuLabel>
        <DropdownMenuItem>Call the customer</DropdownMenuItem>
        <DropdownMenuItem>Reprint the ticket</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive">Cancel order</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function PopoverDemo() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="dense" variant="ghost">Why is this pinned?</Button>
      </PopoverTrigger>
      <PopoverContent align="start">
        <PopoverHeader>
          <PopoverTitle>Address pending</PopoverTitle>
          <PopoverDescription>
            The caller has not given an address yet. The card stays pinned until one arrives — it never
            times out.
          </PopoverDescription>
        </PopoverHeader>
      </PopoverContent>
    </Popover>
  )
}

export function TooltipDemo() {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button size="dense" variant="ghost">Elapsed</Button>
        </TooltipTrigger>
        <TooltipContent>Counts up from receipt, never hidden.</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

/** Sonner. Transient confirmations only — never an error that has a retry (§11.15). */
export function ToastDemo() {
  return (
    <>
      <Button size="dense" variant="ghost" onClick={() => toast.success('Menu published')}>Success</Button>
      <Button size="dense" variant="ghost" onClick={() => toast.info('Payment link sent')}>Info</Button>
      <Button size="dense" variant="ghost" onClick={() => toast.warning('Trial has 5 calls left')}>Warning</Button>
      <Toaster />
    </>
  )
}
