'use client'

import { useState } from 'react'
import type { OrderStatus } from '@/core/orders.ts'
import type { Lang } from '@/ui/i18n.ts'
import { MenuItemRow, type MenuItemView } from '@/ui/MenuItemRow.tsx'
import { OrderCard, type OrderCardData } from '@/ui/OrderCard.tsx'
import { QtyStepper } from '@/ui/QtyStepper.tsx'
import { ResendOtp } from '@/ui/OtpInput.tsx'
import { Button } from '@/ui/Button.tsx'

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
