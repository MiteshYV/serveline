'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { OrderStatus } from '@/core/orders.ts'
import { Band } from '@/ui/Band.tsx'
import { Button } from '@/ui/Button.tsx'
import { td } from '@/ui/i18n-dashboard.ts'
import { t, type Lang } from '@/ui/i18n.ts'
import { OrderCard } from '@/ui/OrderCard.tsx'
import { cardFromWire, type CardWire } from '@/ui/orderWire.ts'
import { convertToCodAction, markCorrectedAction, resendPaymentLink, transition, type ActionResult } from '../../board-actions.ts'

/**
 * The detail page's card and its full action set (Build Spec §7): the same OrderCard as the
 * board, plus the three ⋯ actions as visible 56px buttons — the page has the room the card lacks.
 */
export function DetailCard({ wire, lang }: { wire: CardWire; lang: Lang }) {
  const router = useRouter()
  const [current, setCurrent] = useState(wire)
  const [notice, setNotice] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  const apply = async (p: Promise<ActionResult>, done?: string) => {
    const res = await p
    if (!res.ok) {
      setFailed(true)
      throw new Error(res.error)
    }
    setFailed(false)
    setCurrent(res.order)
    if (done) setNotice(done)
    router.refresh()
  }

  const onAction = (to: OrderStatus, reason?: string) =>
    apply(transition({ orderId: current.id, to, ...(reason ? { reason } : {}) }))

  return (
    <div className="grid gap-[var(--space-12)]">
      {failed && <Band tone="attention">{t('action.retry', lang)}</Band>}
      {notice && <Band tone="neutral">{notice}</Band>}
      <OrderCard order={cardFromWire(current)} lang={lang} onAction={onAction} />
      <div className="grid gap-[var(--space-16)]">
        {current.canResendLink && (
          <Button size="counter" variant="ghost" block onClick={() => apply(resendPaymentLink(current.id), td('detail.linkSent', lang)).catch(() => undefined)}>
            {td('board.resendLink', lang)}
          </Button>
        )}
        {current.canConvertToCod && (
          <Button size="counter" variant="ghost" block onClick={() => apply(convertToCodAction(current.id)).catch(() => undefined)}>
            {td('board.convertCod', lang)}
          </Button>
        )}
        {current.correctionFlag ? (
          <p className="m-0" style={{ fontSize: 'var(--text-label)', color: 'var(--text-secondary)' }}>{td('detail.corrected', lang)}</p>
        ) : (
          <Button size="counter" variant="ghost" block onClick={() => apply(markCorrectedAction(current.id), td('detail.corrected', lang)).catch(() => undefined)}>
            {td('board.markCorrected', lang)}
          </Button>
        )}
      </div>
    </div>
  )
}
