'use client'

import { useState } from 'react'
import type { OrderStatus } from '@/core/orders.ts'
import type { Lang } from '@/ui/i18n.ts'
import { MenuItemRow, type MenuItemView } from '@/ui/MenuItemRow.tsx'
import { OrderCard, type OrderCardData } from '@/ui/OrderCard.tsx'
import { QtyStepper } from '@/ui/QtyStepper.tsx'
import { ResendOtp } from '@/ui/OtpInput.tsx'
import { Button } from '@/ui/Button.tsx'
import { AlertDialog } from '@astryxdesign/core/AlertDialog'
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog'
import { DropdownMenu } from '@astryxdesign/core/DropdownMenu'
import { HStack } from '@astryxdesign/core/HStack'
import { Popover } from '@astryxdesign/core/Popover'
import { Selector } from '@astryxdesign/core/Selector'
import { Switch } from '@astryxdesign/core/Switch'
import { Tab, TabList } from '@astryxdesign/core/TabList'
import { Text } from '@astryxdesign/core/Text'
import { useToast } from '@astryxdesign/core/Toast'
import { Tooltip } from '@astryxdesign/core/Tooltip'
import { VStack } from '@astryxdesign/core/VStack'

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
   Astryx components (ADR 0010). They own their keyboard and ARIA behaviour — focus trapping,
   roving tabindex, Escape, returning focus to the trigger — and draw from the neutral theme in
   both modes. Shown here so both themes can be looked at side by side.
   --------------------------------------------------------------------------- */

export function SelectDemo() {
  const [status, setStatus] = useState('received')
  return (
    <Selector
      label="Order status"
      isLabelHidden
      value={status}
      onChange={setStatus}
      options={[
        { value: 'received', label: 'Received' },
        { value: 'preparing', label: 'Preparing' },
        { value: 'ready', label: 'Ready' },
        { value: 'delivered', label: 'Delivered' },
      ]}
    />
  )
}

export function SwitchDemo() {
  const [on, setOn] = useState(true)
  return <Switch label="Order sounds" value={on} onChange={setOn} />
}

export function TabsDemo() {
  const [tab, setTab] = useState('active')
  return (
    <VStack gap={2} width="100%">
      <TabList value={tab} onChange={setTab} role="tablist" hasDivider>
        <Tab value="active" label="Active" panelId="sg-tab-active" />
        <Tab value="done" label="Done" panelId="sg-tab-done" />
      </TabList>
      <div id={`sg-tab-${tab}`} role="tabpanel">
        <Text>{tab === 'active' ? 'Four orders on the board.' : 'Fourteen orders finished today.'}</Text>
      </div>
    </VStack>
  )
}

export function DialogDemo() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button size="dense" variant="ghost" onClick={() => setOpen(true)}>Print card batch…</Button>
      <Dialog isOpen={open} onOpenChange={setOpen} padding={4}>
        <VStack gap={4}>
          <DialogHeader title="Print 50 table cards?" onOpenChange={setOpen} hasDivider={false} />
          <Text color="secondary">
            Each card carries the QR for one table. Printing does not change the menu or the board.
          </Text>
          <HStack gap={2}>
            <Button size="dense" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button size="dense" onClick={() => setOpen(false)}>Print</Button>
          </HStack>
        </VStack>
      </Dialog>
    </>
  )
}

export function AlertDialogDemo() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button size="dense" variant="ghost" onClick={() => setOpen(true)}>Delete category…</Button>
      <AlertDialog
        isOpen={open}
        onOpenChange={setOpen}
        title="Delete “Starters”?"
        description="The 6 items in it go too. Deleting cannot be undone."
        actionLabel="Delete category and 6 items"
        cancelLabel="Keep it"
        onAction={() => setOpen(false)}
      />
    </>
  )
}

export function DropdownDemo() {
  return (
    <DropdownMenu
      button={{ label: 'More…', size: 'sm' }}
      items={[
        { type: 'section', title: 'Order 1284', items: [
          { label: 'Call the customer' },
          { label: 'Reprint the ticket' },
        ] },
        { type: 'divider' },
        { label: 'Cancel order', variant: 'destructive' },
      ]}
    />
  )
}

export function PopoverDemo() {
  return (
    <Popover
      label="Address pending"
      width={320}
      content={
        <VStack gap={1}>
          <Text weight="semibold">Address pending</Text>
          <Text color="secondary">
            The caller has not given an address yet. The card stays pinned until one arrives — it never
            times out.
          </Text>
        </VStack>
      }
    >
      <Button size="dense" variant="ghost">Why is this pinned?</Button>
    </Popover>
  )
}

export function TooltipDemo() {
  return (
    <Tooltip content="Counts up from receipt, never hidden.">
      <Button size="dense" variant="ghost">Elapsed</Button>
    </Tooltip>
  )
}

/** Astryx toasts. Transient confirmations only — never an error that has a retry (§11.15). */
export function ToastDemo() {
  const showToast = useToast()
  return (
    <>
      <Button size="dense" variant="ghost" onClick={() => showToast({ body: 'Menu published' })}>Success</Button>
      <Button size="dense" variant="ghost" onClick={() => showToast({ body: 'Payment link sent' })}>Info</Button>
      <Button size="dense" variant="ghost" onClick={() => showToast({ body: 'Trial has 5 calls left' })}>Warning</Button>
    </>
  )
}
