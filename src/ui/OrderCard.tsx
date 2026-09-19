'use client'

import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react'
import { formatINR, paise } from '../core/money.ts'
import { isTerminal, type Fulfilment, type OrderStatus } from '../core/orders.ts'
import { Button } from './Button.tsx'
import { Field } from './Field.tsx'
import fieldStyles from './Field.module.css'
import { t, type Lang, type UiKey } from './i18n.ts'
import { primaryAction } from './orderActions.ts'
import { StatusChip } from './StatusChip.tsx'
import { toneOf } from './StateGlyph.tsx'
import { formatDuration } from './time.ts'
import styles from './OrderCard.module.css'

/** What the card needs; the dashboard maps a repository row into this. All money is paise. */
export type OrderCardData = {
  id: string
  /**
   * The display number ("1284"). Build Spec §4 gives `order` a uuid and no sequence column, so
   * the dashboard decides what this is — a per-day sequence over placed_at is the obvious one.
   */
  number: string
  status: OrderStatus
  fulfilment: Fulfilment
  channel: 'ai_call' | 'page_table' | 'page_delivery' | 'staff_manual'
  tableNo?: string | null
  /** The delivery locator beside "DELIVERY": the address area, e.g. "Koramangala". */
  area?: string | null
  placedAt: Date
  totalPaise: number
  paymentMethod: 'upi_link' | 'cod' | 'pay_at_table'
  paymentStatus: 'unpaid' | 'awaiting' | 'paid' | 'refunded'
  items: { qty: number; name: string; variant?: string | null; options?: string[] }[]
  notes?: string | null
  /** One line for the expanded view. */
  addressText?: string | null
  /** Drives the tel: intents. Staff see it on screen; it is never logged. */
  customerPhone?: string | null
  /** needs_attention only: the reason, in plain language ("Customer has not answered 2 calls"). */
  attentionReason?: string | null
}

type Props = {
  order: OrderCardData
  lang: Lang
  /**
   * Resolve once the server has applied the transition; reject on failure. The card applies the
   * change optimistically, drains the button while it syncs, and on rejection reverts, takes the
   * attention edge and turns the primary into "Tap to try again" (design §7.10.2). The parent
   * re-rendering with the new `order.status` (router.refresh, SSE) clears the optimistic state.
   */
  onAction: (to: OrderStatus, reason?: string) => Promise<void>
  /** Extra entries behind ⋯ — Build Spec §7's mark corrected, resend payment link, convert to COD. */
  extraActions?: { label: string; onSelect: () => void | Promise<void> }[]
}

type Op = { to: OrderStatus; reason?: string; phase: 'syncing' | 'settled' | 'failed' }

function paymentKey(o: OrderCardData): UiKey {
  if (o.paymentStatus === 'paid') return 'payment.paid'
  if (o.paymentStatus === 'refunded') return 'payment.refunded'
  if (o.paymentMethod === 'cod') return 'payment.cod'
  if (o.paymentMethod === 'pay_at_table') return 'payment.payAtTable'
  return o.paymentStatus === 'awaiting' ? 'payment.awaiting' : 'payment.unpaid'
}

/**
 * Design §7.1, the centrepiece, at counter density. One bounded object with a 4px enamel edge;
 * a scan layer sized for 65 cm; a lean-in row that expands inline; ONE primary action; everything
 * else behind a 56×56 ⋯, with cancel behind a one-step confirm.
 */
export function OrderCard({ order, lang, onAction, extraActions }: Props) {
  const numId = useId()
  const [expanded, setExpanded] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [reason, setReason] = useState('')
  const [reasonMissing, setReasonMissing] = useState(false)

  // Optimistic state. When the parent's status changes (the server caught up, or SSE brought a
  // newer state), the op is finished with — React's adjust-state-on-prop-change pattern.
  const [op, setOp] = useState<Op | null>(null)
  const [seenStatus, setSeenStatus] = useState(order.status)
  if (order.status !== seenStatus) {
    setSeenStatus(order.status)
    setOp(null)
  }
  const failed = op?.phase === 'failed'
  const syncing = op?.phase === 'syncing'
  const displayStatus = op && !failed ? op.to : order.status

  const collapsed = isTerminal(displayStatus)
  const pinned = displayStatus === 'address_pending'
  const tone = failed ? 'attention' : toneOf(displayStatus)

  // The elapsed timer counts up from receipt and is never hidden on an active card.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (collapsed) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [collapsed])

  async function run(to: OrderStatus, why?: string) {
    setMenuOpen(false)
    setConfirming(false)
    setOp({ to, reason: why, phase: 'syncing' })
    try {
      await onAction(to, why)
      setOp((cur) => (cur && cur.to === to ? { ...cur, phase: 'settled' } : cur))
    } catch {
      setOp({ to, reason: why, phase: 'failed' })
    }
  }

  function submitCancel(e: FormEvent) {
    e.preventDefault()
    const why = reason.trim()
    if (!why) {
      setReasonMissing(true)
      return
    }
    void run('cancelled', why)
  }

  const itemCount = order.items.reduce((n, i) => n + i.qty, 0)
  const total = formatINR(paise(order.totalPaise))
  const action = primaryAction(displayStatus, order.fulfilment)

  let primary: ReactNode = null
  if (failed && op) {
    primary = (
      <Button variant="ghost" size="counter" block className={styles.retry} onClick={() => void run(op.to, op.reason)}>
        {t('action.retry', lang)}
      </Button>
    )
  } else if (pinned) {
    // Design §7.1: stays pinned until an address exists; the action opens a tel: intent.
    primary = order.customerPhone ? (
      <Button variant="primary" size="counter" block href={`tel:${order.customerPhone}`}>
        {t('action.getAddress', lang)}
      </Button>
    ) : null
  } else if (action) {
    primary = (
      <Button
        variant="primary"
        size="counter"
        block
        aria-disabled={syncing || undefined}
        onClick={() => {
          if (!syncing) void run(action.to)
        }}
      >
        {syncing ? t('action.saving', lang) : t(action.key, lang)}
      </Button>
    )
  }

  return (
    <article
      className={styles.card}
      data-tone={tone}
      data-status={displayStatus}
      data-pinned={pinned || undefined}
      data-collapsed={collapsed || undefined}
      data-failed={failed || undefined}
      aria-labelledby={numId}
      aria-busy={syncing || undefined}
    >
      {pinned && <span className={styles.pinned}>{t('card.pinned', lang)}</span>}

      <header className={styles.scan}>
        <span id={numId} className={`${styles.number} num`}>
          #{order.number}
        </span>
        <StatusChip status={displayStatus} fulfilment={order.fulfilment} variant="filled" lang={lang} />
        {collapsed ? (
          <span className={`${styles.total} num`}>{total}</span>
        ) : (
          <time
            className={`${styles.timer} num`}
            dateTime={order.placedAt.toISOString()}
            aria-label={t('card.elapsed', lang)}
            suppressHydrationWarning
          >
            {formatDuration(now - order.placedAt.getTime())}
          </time>
        )}
      </header>

      {!collapsed && (
        <>
          <div className={styles.locator}>
            <Locator order={order} />
            <span className={styles.channel}>{t(`channel.${order.channel}`, lang)}</span>
          </div>

          <button
            type="button"
            className={styles.leanIn}
            aria-expanded={expanded}
            aria-label={t(expanded ? 'card.hideItems' : 'card.showItems', lang)}
            onClick={() => setExpanded((v) => !v)}
          >
            <span className="num">{itemCount}</span>
            <span>{t(itemCount === 1 ? 'cart.itemWord' : 'cart.itemsWord', lang)}</span>
            <span className={styles.sep} aria-hidden="true">·</span>
            <span className={`num ${styles.leanTotal}`}>{total}</span>
            <span className={styles.sep} aria-hidden="true">·</span>
            <span className={styles.payment}>{t(paymentKey(order), lang)}</span>
            <svg className={styles.chevron} data-open={expanded || undefined} width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M3 6l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          {expanded && (
            <div className={styles.detail}>
              <ul className={styles.items}>
                {order.items.map((it, i) => (
                  <li key={i}>
                    <span className={`num ${styles.qty}`}>{it.qty}×</span> {it.name}
                    {it.variant ? ` (${it.variant})` : ''}
                    {it.options && it.options.length > 0 ? ` — ${it.options.join(', ')}` : ''}
                  </li>
                ))}
              </ul>
              {order.notes && (
                <p className={styles.note}>
                  <b>{t('card.notes', lang)}:</b> {order.notes}
                </p>
              )}
              {order.addressText && (
                <p className={styles.note}>
                  <b>{t('card.address', lang)}:</b> {order.addressText}
                </p>
              )}
            </div>
          )}

          {displayStatus === 'needs_attention' && order.attentionReason && (
            <p className={styles.band}>{order.attentionReason}</p>
          )}

          <div className={styles.actions}>
            {primary}
            <button
              type="button"
              className={styles.more}
              aria-label={t('action.more', lang)}
              aria-expanded={menuOpen}
              onClick={() => {
                setMenuOpen((v) => !v)
                setConfirming(false)
              }}
            >
              <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
                <circle cx="4" cy="10" r="1.8" fill="currentColor" />
                <circle cx="10" cy="10" r="1.8" fill="currentColor" />
                <circle cx="16" cy="10" r="1.8" fill="currentColor" />
              </svg>
            </button>
          </div>

          {menuOpen && !confirming && (
            <div className={styles.menu}>
              {order.customerPhone && (
                <Button variant="ghost" size="counter" block href={`tel:${order.customerPhone}`}>
                  {t('action.call', lang)}
                </Button>
              )}
              {extraActions?.map((a) => (
                <Button
                  key={a.label}
                  variant="ghost"
                  size="counter"
                  block
                  onClick={() => {
                    setMenuOpen(false)
                    void a.onSelect()
                  }}
                >
                  {a.label}
                </Button>
              ))}
              {/* Isolated destruction (design §6.3): never in the action bar, 16px from anything, one-step confirm. */}
              <Button variant="ghost" size="counter" block className={styles.cancelEntry} onClick={() => setConfirming(true)}>
                {t('action.cancel', lang)}
              </Button>
            </div>
          )}

          {confirming && (
            <form className={styles.confirm} onSubmit={submitCancel}>
              <p className={styles.confirmTitle}>{t('action.cancelConfirm', lang)}</p>
              {/* Build Spec §7: cancel with reason. Free text is the simplest reading; quick-pick reasons are a product decision not yet made. */}
              <Field
                id={`${numId}-reason`}
                label={t('action.cancelReason', lang)}
                error={reasonMissing ? t('action.cancelReasonRequired', lang) : undefined}
              >
                {(input) => (
                  <input
                    {...input}
                    className={fieldStyles.control}
                    type="text"
                    value={reason}
                    autoFocus
                    onChange={(e) => {
                      setReason(e.target.value)
                      if (reasonMissing && e.target.value.trim()) setReasonMissing(false)
                    }}
                  />
                )}
              </Field>
              <div className={styles.confirmActions}>
                <Button
                  variant="ghost"
                  size="counter"
                  onClick={() => {
                    setConfirming(false)
                    setMenuOpen(false)
                    setReasonMissing(false)
                  }}
                >
                  {t('action.keep', lang)}
                </Button>
                <Button variant="danger" size="counter" type="submit">
                  {t('action.cancel', lang)}
                </Button>
              </div>
            </form>
          )}
        </>
      )}
    </article>
  )
}

/**
 * Row 2 of the scan layer. TABLE / DELIVERY / PICKUP are hard-coded Latin system labels — the
 * design (§7.1) sizes them 16/700 with 0.02em tracking and uppercase, which is only legal because
 * they are not translated. The area beside DELIVERY is user content and gets neither.
 */
function Locator({ order }: { order: OrderCardData }) {
  if (order.fulfilment === 'dine_in') {
    return (
      <>
        <span className={styles.locLabel}>Table</span>
        <span className={`${styles.locNumber} num`}>{order.tableNo ?? '—'}</span>
      </>
    )
  }
  if (order.fulfilment === 'pickup') return <span className={styles.locLabel}>Pickup</span>
  return (
    <>
      <span className={styles.locLabel}>Delivery</span>
      {order.area && <span className={styles.locArea}>· {order.area}</span>}
    </>
  )
}
