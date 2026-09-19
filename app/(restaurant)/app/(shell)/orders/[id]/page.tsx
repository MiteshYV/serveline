import { notFound } from 'next/navigation'
import { formatISTDateTime, formatISTTime } from '@/core/calendar.ts'
import { formatINR, paise } from '@/core/money.ts'
import { getBoardOrder, orderNumbers } from '@/db/repos/index.ts'
import { td } from '@/ui/i18n-dashboard.ts'
import { orderStateLabel, t, type Lang, type UiKey } from '@/ui/i18n.ts'
import { toCardWire } from '@/ui/orderWire.ts'
import { readLang } from '../../../_lib/prefs.ts'
import { currentOutlet } from '../../../_lib/session.ts'
import { DetailCard } from './DetailCard.tsx'

export const metadata = { title: 'Order — ServeLine' }

const ACTOR: Record<string, string> = { customer: 'Customer', staff: 'Staff', platform: 'ServeLine', system: 'System', ai: 'AI' }

const paymentKey = (status: string): UiKey =>
  status === 'paid' ? 'payment.paid' : status === 'refunded' ? 'payment.refunded' : status === 'awaiting' ? 'payment.awaiting' : 'payment.unpaid'

/** Build Spec §7: every order action, plus the timeline and the payment trail. */
export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { outlet } = await currentOutlet()
  const row = await getBoardOrder(id)
  if (!row || row.outletId !== outlet.id) notFound()
  const lang: Lang = await readLang()
  const numbers = await orderNumbers(outlet.id, [row])
  const wire = toCardWire(row, numbers.get(row.id))

  return (
    <div className="grid gap-[var(--space-24)]">
      <DetailCard wire={wire} lang={lang} />

      <section className="grid gap-[var(--space-8)]">
        <h2 className="m-0" style={{ fontSize: 'var(--text-caption)', fontWeight: 'var(--fw-bold)', color: 'var(--text-tertiary)' }}>{td('detail.customer', lang)}</h2>
        <p className="m-0" style={{ fontSize: 'var(--text-body)' }}>
          {row.customer ? (
            <>
              {row.customer.name ? `${row.customer.name} · ` : ''}
              <a href={`tel:${row.customer.phone}`} className="num" style={{ color: 'var(--text-primary)' }}>{row.customer.phone}</a>
            </>
          ) : (
            <span style={{ color: 'var(--text-secondary)' }}>{td('detail.noPhone', lang)}</span>
          )}
        </p>
        {row.notes && row.status !== 'needs_attention' && (
          <p className="m-0" style={{ fontSize: 'var(--text-label)', color: 'var(--text-secondary)' }}><b>{t('card.notes', lang)}:</b> {row.notes}</p>
        )}
        {row.cancelledReason && (
          <p className="m-0" style={{ fontSize: 'var(--text-label)', color: 'var(--text-secondary)' }}>{td('detail.cancelledReason', lang, { reason: row.cancelledReason })}</p>
        )}
      </section>

      <section className="grid gap-[var(--space-8)]">
        <h2 className="m-0" style={{ fontSize: 'var(--text-caption)', fontWeight: 'var(--fw-bold)', color: 'var(--text-tertiary)' }}>{td('detail.payment', lang)}</h2>
        <p className="m-0" style={{ fontSize: 'var(--text-body)' }}>
          <span className="num">{formatINR(paise(row.totalPaise))}</span>
          {row.discountPaise > 0 && <span style={{ color: 'var(--text-secondary)' }}> · {t('cart.discount', lang)} <span className="num">{formatINR(paise(row.discountPaise))}</span></span>}
          {' · '}
          {row.paymentMethod === 'cod' ? t('payment.cod', lang) : row.paymentMethod === 'pay_at_table' ? t('payment.payAtTable', lang) : 'UPI'}
          {' · '}
          {t(paymentKey(row.paymentStatus), lang)}
        </p>
        {row.payments.length > 0 && (
          <ul className="m-0 p-0 list-none grid gap-[var(--space-4)]" style={{ fontSize: 'var(--text-label)', color: 'var(--text-secondary)' }}>
            {row.payments.map((p) => (
              <li key={p.id}>
                {td('detail.linkStatus', lang, { status: t(paymentKey(p.status), lang).toLowerCase() })} · <span className="num">{formatISTDateTime(p.paidAt ?? p.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid gap-[var(--space-8)]">
        <h2 className="m-0" style={{ fontSize: 'var(--text-caption)', fontWeight: 'var(--fw-bold)', color: 'var(--text-tertiary)' }}>{td('detail.timeline', lang)}</h2>
        <ol className="m-0 p-0 list-none grid gap-[var(--space-6)]" style={{ fontSize: 'var(--text-label)' }}>
          {row.events.map((e) => (
            <li key={e.id} className="flex gap-[var(--space-12)]">
              <time className="num" dateTime={e.at.toISOString()} style={{ color: 'var(--text-tertiary)', minWidth: '3.5em' }}>{formatISTTime(e.at)}</time>
              <span>
                {e.fromStatus === null ? td('detail.placed', lang) : orderStateLabel(e.toStatus, row.fulfilment, lang)}
                <span style={{ color: 'var(--text-tertiary)' }}> · {ACTOR[e.actorType] ?? e.actorType}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  )
}
