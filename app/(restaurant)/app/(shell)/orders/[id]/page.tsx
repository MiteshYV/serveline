import { notFound } from 'next/navigation'
import { formatISTDateTime, formatISTTime } from '@/core/calendar.ts'
import { formatINR, paise } from '@/core/money.ts'
import { getBoardOrder, orderNumbers } from '@/db/repos/index.ts'
import { td } from '@/ui/i18n-dashboard.ts'
import { orderStateLabel, t, type Lang, type UiKey } from '@/ui/i18n.ts'
import { toCardWire } from '@/ui/orderWire.ts'
import { readLang } from '../../../_lib/prefs.ts'
import { currentOutlet } from '../../../_lib/session.ts'
import { PageHead } from '../../bits.tsx'
import { DetailCard } from './DetailCard.tsx'
import styles from './Detail.module.css'

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
    <div className={styles.page}>
      {/* This page had no <h1> at all. The order's number is its name on the counter (design
          §7.1), and the word beside it comes from the dictionary — never a hard-coded English
          string on a surface the operator reads (i18n-dashboard.ts). */}
      <PageHead
        crumbs={<a href="/app">{td('nav.board', lang)}</a>}
        title={<>{td('manual.order', lang)} <span className="num">#{wire.number}</span></>}
        meta={orderStateLabel(wire.status, wire.fulfilment, lang)}
      />

      <DetailCard wire={wire} lang={lang} />

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{td('detail.customer', lang)}</h2>
        <p className={styles.line}>
          {row.customer ? (
            <>
              {row.customer.name ? `${row.customer.name} · ` : ''}
              <a href={`tel:${row.customer.phone}`} className={`${styles.phone} num`}>{row.customer.phone}</a>
            </>
          ) : (
            <span className={styles.quiet}>{td('detail.noPhone', lang)}</span>
          )}
        </p>
        {row.notes && row.status !== 'needs_attention' && (
          <p className={styles.note}><b>{t('card.notes', lang)}:</b> {row.notes}</p>
        )}
        {row.cancelledReason && (
          <p className={styles.note}>{td('detail.cancelledReason', lang, { reason: row.cancelledReason })}</p>
        )}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{td('detail.payment', lang)}</h2>
        <p className={styles.line}>
          <span className="num">{formatINR(paise(row.totalPaise))}</span>
          {row.discountPaise > 0 && <span className={styles.quiet}> · {t('cart.discount', lang)} <span className="num">{formatINR(paise(row.discountPaise))}</span></span>}
          {' · '}
          {row.paymentMethod === 'cod' ? t('payment.cod', lang) : row.paymentMethod === 'pay_at_table' ? t('payment.payAtTable', lang) : 'UPI'}
          {' · '}
          {t(paymentKey(row.paymentStatus), lang)}
        </p>
        {row.payments.length > 0 && (
          <ul className={styles.payments}>
            {row.payments.map((p) => (
              <li key={p.id}>
                {td('detail.linkStatus', lang, { status: t(paymentKey(p.status), lang).toLowerCase() })} · <span className="num">{formatISTDateTime(p.paidAt ?? p.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{td('detail.timeline', lang)}</h2>
        <ol className={styles.timeline}>
          {row.events.map((e) => (
            <li key={e.id} className={styles.event}>
              <time className={`${styles.at} num`} dateTime={e.at.toISOString()}>{formatISTTime(e.at)}</time>
              <span>
                {e.fromStatus === null ? td('detail.placed', lang) : orderStateLabel(e.toStatus, row.fulfilment, lang)}
                <span className={styles.actor}> · {ACTOR[e.actorType] ?? e.actorType}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  )
}
