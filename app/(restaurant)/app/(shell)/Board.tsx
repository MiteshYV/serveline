'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Band } from '@/ui/Band.tsx'
import { Button } from '@/ui/Button.tsx'
import { EmptyState } from '@/ui/EmptyState.tsx'
import { td } from '@/ui/i18n-dashboard.ts'
import { orderStateLabel, t, type Lang } from '@/ui/i18n.ts'
import { OrderCard } from '@/ui/OrderCard.tsx'
import { cardFromWire, type BoardGroup, type CardWire } from '@/ui/orderWire.ts'
import { istDate, msToNextIstDayStart } from '@/core/calendar.ts'
import type { OrderStatus } from '@/core/orders.ts'
import { convertToCodAction, markCorrectedAction, resendPaymentLink, transition, type ActionResult } from './board-actions.ts'
import { useOrderSound } from './sound.ts'
import styles from './Board.module.css'

type Props = {
  outletId: string
  lang: Lang
  initial: CardWire[]
  /** ISO instant the server rendered `initial`; the stream starts from here. */
  since: string
  ordersToday: number
}

type Groups = Record<BoardGroup, string[]>
const emptyGroups = (): Groups => ({ pinned: [], attention: [], active: [], done: [] })

const SSE_RETRY_MS = 30_000
const POLL_MS = 5_000
/** Two missed heartbeats (the stream beats every 15 s) and the stream is presumed dead. */
const STALE_MS = 35_000

/**
 * The live board (Build Spec §7, design §6.3, §8). Position is stable for an order's whole life:
 * a new order appends to its group and is announced by the count in the band, never by a
 * re-sort. State lives in two structures — the orders by id, and the id order per group — so an
 * update never touches position and a group change is an explicit move to the end of the new group.
 */
export function Board({ outletId, lang, initial, since, ordersToday }: Props) {
  const router = useRouter()
  const [orders, setOrders] = useState<Map<string, CardWire>>(() => new Map(initial.map((o) => [o.id, o])))
  const [groups, setGroups] = useState<Groups>(() => {
    const g = emptyGroups()
    for (const o of initial) g[o.group].push(o.id)
    return g
  })
  const [newCount, setNewCount] = useState(0)
  const [pulseKey, setPulseKey] = useState(0)
  const [offline, setOffline] = useState(false)
  const [announce, setAnnounce] = useState('')
  // "N orders today" (design §7.9) — placed today, so it grows on arrival, never on completion.
  const [todayCount, setTodayCount] = useState(ordersToday)
  // The IST day `todayCount` belongs to. A counter tablet stays open for days, so the count has
  // to be reset from the clock; nothing else in the mounted tree reads it
  // (finding orders-today-never-resets-at-midnight).
  const dayRef = useRef(istDate(new Date()))
  const sound = useOrderSound()
  const playRef = useRef(sound.play)
  playRef.current = sound.play

  const sinceRef = useRef(since)
  const ordersRef = useRef(orders)
  ordersRef.current = orders

  const merge = useCallback((incoming: CardWire[]) => {
    if (incoming.length === 0) return
    let arrived = 0
    const arrivedIds: string[] = []
    setOrders((prev) => {
      const next = new Map(prev)
      for (const w of incoming) next.set(w.id, w)
      return next
    })
    setGroups((prev) => {
      const next: Groups = { pinned: [...prev.pinned], attention: [...prev.attention], active: [...prev.active], done: [...prev.done] }
      for (const w of incoming) {
        const existing = ordersRef.current.get(w.id)
        const from = existing ? existing.group : null
        if (from === w.group) continue
        if (from) next[from] = next[from].filter((id) => id !== w.id)
        else if (w.group !== 'done') {
          arrived += 1
          arrivedIds.push(w.id)
        }
        if (!next[w.group].includes(w.id)) next[w.group].push(w.id)
      }
      return next
    })
    if (arrived > 0) {
      // An order arriving after IST midnight starts the new day, rather than adding to yesterday's
      // total, in case the timer below has not fired yet (a sleeping tablet throttles it).
      const today = istDate(new Date())
      const rolled = today !== dayRef.current
      if (rolled) dayRef.current = today
      setNewCount((n) => n + arrived)
      setTodayCount((n) => (rolled ? arrived : n + arrived))
      setPulseKey((k) => k + 1)
      playRef.current()
    } else {
      // Design §9: a polite region for state changes; the assertive one is the new-order band alone.
      const last = incoming[incoming.length - 1]
      if (last) {
        setAnnounce(td('board.stateChanged', lang, { n: last.number, state: orderStateLabel(last.status, last.fulfilment, lang) }))
      }
    }
  }, [lang])

  // ---- the IST day boundary (finding orders-today-never-resets-at-midnight) ----
  // `ordersToday` is seeded once on the server and the board is then kept live by SSE alone, so
  // without this a tablet left on overnight shows yesterday's trade all morning. A timer alone is
  // not enough — a backgrounded or sleeping tablet throttles it — so the day is re-read on wake.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const rollIfNewDay = () => {
      const today = istDate(new Date())
      if (today === dayRef.current) return
      dayRef.current = today
      setTodayCount(0)
    }
    const arm = () => {
      // A second past the boundary, so a timer that fires a hair early still sees the new date.
      timer = setTimeout(() => {
        rollIfNewDay()
        arm()
      }, msToNextIstDayStart(new Date()) + 1_000)
    }
    const onWake = () => {
      rollIfNewDay()
      clearTimeout(timer)
      arm()
    }
    arm()
    document.addEventListener('visibilitychange', onWake)
    window.addEventListener('focus', onWake)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onWake)
      window.removeEventListener('focus', onWake)
    }
  }, [])

  // ---- transport: SSE, then a 5-second poll when the stream fails (Build Spec §7) ----
  useEffect(() => {
    let es: EventSource | null = null
    let poll: ReturnType<typeof setInterval> | null = null
    let retry: ReturnType<typeof setTimeout> | null = null
    let stale: ReturnType<typeof setTimeout> | null = null
    let stopped = false

    const url = (path: string) => `/api/v1/outlets/${outletId}/orders${path}?since=${encodeURIComponent(sinceRef.current)}`

    const take = (feed: { at: string; orders: CardWire[] }) => {
      sinceRef.current = new Date(new Date(feed.at).getTime() - 1_000).toISOString()
      merge(feed.orders)
    }

    const pollOnce = async () => {
      try {
        const r = await fetch(url(''), { cache: 'no-store' })
        if (!r.ok) throw new Error(String(r.status))
        take((await r.json()) as { at: string; orders: CardWire[] })
        setOffline(false)
      } catch {
        setOffline(true)
      }
    }
    const startPoll = () => {
      if (poll || stopped) return
      void pollOnce()
      poll = setInterval(() => void pollOnce(), POLL_MS)
    }
    const stopPoll = () => {
      if (poll) clearInterval(poll)
      poll = null
    }
    const touch = () => {
      if (stale) clearTimeout(stale)
      stale = setTimeout(() => fail(), STALE_MS)
    }
    const fail = () => {
      es?.close()
      es = null
      if (stale) clearTimeout(stale)
      startPoll()
      if (!retry) retry = setTimeout(() => {
        retry = null
        connect()
      }, SSE_RETRY_MS)
    }
    const connect = () => {
      if (stopped || typeof EventSource === 'undefined') {
        startPoll()
        return
      }
      es = new EventSource(url('/stream'))
      es.onopen = () => {
        setOffline(false)
        stopPoll()
        touch()
      }
      es.onmessage = (ev) => {
        touch()
        try {
          take(JSON.parse(ev.data as string) as { at: string; orders: CardWire[] })
        } catch {
          /* a malformed frame is dropped; the next poll or frame carries the truth */
        }
      }
      es.onerror = () => fail()
    }

    connect()
    return () => {
      stopped = true
      es?.close()
      stopPoll()
      if (retry) clearTimeout(retry)
      if (stale) clearTimeout(stale)
    }
  }, [outletId, merge])

  // ---- actions ----
  const apply = useCallback(async (p: Promise<ActionResult>) => {
    const res = await p
    if (!res.ok) throw new Error(res.error)
    merge([res.order])
  }, [merge])

  const onAction = useCallback((id: string) => (to: OrderStatus, reason?: string) =>
    apply(transition({ orderId: id, to, ...(reason ? { reason } : {}) })), [apply])

  const extraActions = useCallback((w: CardWire) => {
    const list: { label: string; onSelect: () => void | Promise<void> }[] = [
      { label: td('board.details', lang), onSelect: () => router.push(`/app/orders/${w.id}`) },
    ]
    if (w.canResendLink) list.push({ label: td('board.resendLink', lang), onSelect: () => apply(resendPaymentLink(w.id)).catch(() => undefined) })
    if (w.canConvertToCod) list.push({ label: td('board.convertCod', lang), onSelect: () => apply(convertToCodAction(w.id)).catch(() => undefined) })
    if (!w.correctionFlag) list.push({ label: td('board.markCorrected', lang), onSelect: () => apply(markCorrectedAction(w.id)).catch(() => undefined) })
    return list
  }, [apply, lang, router])

  const renderGroup = (ids: string[]) => ids.flatMap((id) => {
    const w = orders.get(id)
    if (!w) return []
    return [
      <li key={id}>
        <OrderCard order={cardFromWire(w)} lang={lang} onAction={onAction(id)} extraActions={extraActions(w)} />
      </li>,
    ]
  })

  const activeCount = groups.pinned.length + groups.attention.length + groups.active.length

  return (
    <section className={styles.board} aria-label={td('nav.board', lang)}>
      <div className={styles.top}>
        {offline && (
          <Band tone="attention" action={<Button size="counter" variant="ghost" onClick={() => router.refresh()}>{t('net.retry', lang)}</Button>}>
            {t('net.offline', lang)}
          </Band>
        )}
        {newCount > 0 && (
          <Band
            key={pulseKey}
            tone="received"
            pulse
            action={<Button size="counter" variant="ghost" onClick={() => setNewCount(0)}>{td('board.seen', lang)}</Button>}
          >
            {newCount === 1 ? t('board.newOrderOne', lang) : t('board.newOrders', lang, { n: newCount })}
          </Band>
        )}
        <div className={styles.toolbar}>
          <span className={styles.count}>{td('board.ordersToday', lang, { n: todayCount })}</span>
          {/* Design §6.1–6.2: a 56px target like everything on the counter, and a ghost — the plate belongs to the card primaries. */}
          {sound.enabled ? (
            <Button size="counter" variant="ghost" onClick={sound.disable}>{td('board.soundOff', lang)}</Button>
          ) : (
            <Button size="counter" variant="ghost" onClick={sound.enable}>{t('board.enableSound', lang)}</Button>
          )}
        </div>
      </div>

      {/* The global `.sr-only` from tokens.css; there is no local copy any more. */}
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{announce}</p>

      {activeCount === 0 && <EmptyState kind="all-done" lang={lang} ordersToday={todayCount} />}

      {groups.pinned.length > 0 && (
        <div className={styles.group}>
          <ul className={styles.list}>{renderGroup(groups.pinned)}</ul>
        </div>
      )}
      {groups.attention.length > 0 && (
        <div className={styles.group}>
          <ul className={styles.list}>{renderGroup(groups.attention)}</ul>
        </div>
      )}
      {groups.active.length > 0 && (
        <div className={styles.group}>
          <ul className={styles.list}>{renderGroup(groups.active)}</ul>
        </div>
      )}
      {groups.done.length > 0 && (
        <details className={styles.done}>
          <summary>
            {t('board.done', lang)} · <span className="num">{groups.done.length}</span>
          </summary>
          <ul className={styles.list}>{renderGroup(groups.done)}</ul>
        </details>
      )}
    </section>
  )
}
