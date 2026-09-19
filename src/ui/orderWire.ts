import type { BoardOrder } from '../db/repos/dashboard.ts'
import { isTerminal } from '../core/orders.ts'
import type { OrderCardData } from './OrderCard.tsx'

/**
 * An order as it crosses the server/client line: the card's data with `placedAt` as ISO text
 * (server actions and the SSE stream carry JSON), plus the board group it sorts into and the two
 * facts the ⋯ menu branches on. `toCardWire` is the one place a repository row becomes card data,
 * so the page, the stream, the poll and every server action agree.
 */
export type BoardGroup = 'pinned' | 'attention' | 'active' | 'done'

export type CardWire = Omit<OrderCardData, 'placedAt'> & {
  placedAt: string
  group: BoardGroup
  /** A UPI link can be resent: unpaid link order with a phone to send it to (Build Spec §7). */
  canResendLink: boolean
  /** "Convert to COD" is offered outside awaiting_payment, where the primary button already does it. */
  canConvertToCod: boolean
  correctionFlag: boolean
}

export function groupOf(status: OrderCardData['status']): BoardGroup {
  if (isTerminal(status)) return 'done'
  if (status === 'address_pending') return 'pinned'
  if (status === 'needs_attention') return 'attention'
  return 'active'
}

type ItemOption = { name?: unknown }

export function toCardWire(row: BoardOrder, number: number | undefined): CardWire {
  const address = row.address
  const addressText = address
    ? [address.line1, address.landmark, address.area, address.pincode].filter(Boolean).join(', ')
    : null
  const unpaidLink = row.paymentMethod === 'upi_link' && row.paymentStatus !== 'paid'
  return {
    id: row.id,
    // No sequence column (Build Spec §4); the rank is per IST day. A row outside the ranked
    // window shows the id's first four characters rather than nothing.
    number: number !== undefined ? String(number) : row.id.slice(0, 4).toUpperCase(),
    status: row.status,
    fulfilment: row.fulfilment,
    channel: row.channel,
    tableNo: row.tableNo,
    area: address?.area ?? address?.pincode ?? null,
    placedAt: row.placedAt.toISOString(),
    totalPaise: row.totalPaise,
    paymentMethod: row.paymentMethod,
    paymentStatus: row.paymentStatus,
    items: row.items.map((it) => {
      // Two snapshot shapes exist in the estate: the repo's name_snapshot already carries the
      // variant and options ("Biryani — Half + Raita"); the seed's carries the item name alone.
      // Only what the snapshot does not already say is appended.
      const optionNames = (Array.isArray(it.options) ? (it.options as ItemOption[]) : [])
        .map((o) => (typeof o.name === 'string' ? o.name : ''))
        .filter((n) => n && !it.nameSnapshot.includes(n))
      const variant = it.variant?.name && !it.nameSnapshot.includes(it.variant.name) ? it.variant.name : null
      return { qty: it.qty, name: it.nameSnapshot, variant, options: optionNames }
    }),
    notes: row.status === 'needs_attention' ? null : row.notes,
    addressText,
    customerPhone: row.customer?.phone ?? null,
    attentionReason: row.status === 'needs_attention' ? (row.notes ?? null) : null,
    group: groupOf(row.status),
    canResendLink: unpaidLink && !!row.customer?.phone && !isTerminal(row.status),
    canConvertToCod: unpaidLink && row.status !== 'awaiting_payment' && !isTerminal(row.status),
    correctionFlag: row.correctionFlag,
  }
}

export function cardFromWire(w: CardWire): OrderCardData {
  const { group: _g, canResendLink: _r, canConvertToCod: _c, correctionFlag: _f, placedAt, ...rest } = w
  return { ...rest, placedAt: new Date(placedAt) }
}
