import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { vendorMode } from '@/adapters/mode.ts'
import { getSession } from '@/auth/session.ts'
import { formatINR, paise } from '@/core/money.ts'
import { isTerminal } from '@/core/orders.ts'
import { getOrder, listAddresses } from '@/db/repos/index.ts'
import { Band } from '@/ui/Band.tsx'
import { Button } from '@/ui/Button.tsx'
import { orderStateLabel, t } from '@/ui/i18n.ts'
import { StateGlyph } from '@/ui/StateGlyph.tsx'
import { StatusChip } from '@/ui/StatusChip.tsx'
import { currentLang, loadRestaurant, param, type SearchParams } from '../../lib.ts'
import { withdrawConsentAction } from './actions.ts'
import { StatusPoller } from './StatusPoller.tsx'
import styles from '../../customer.module.css'

type Props = { params: Promise<{ slug: string; orderId: string }>; searchParams: Promise<SearchParams> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { restaurant } = await loadRestaurant((await params).slug)
  return { title: restaurant.name }
}

const UUID = /^[0-9a-f-]{36}$/

/**
 * `/r/{slug}/order/{orderId}` — the status page (Build Spec §6), polling every 10 s. Modelled
 * on the UPI confirmation screen (design §2): big amount, one state mark, almost no chrome.
 * Visible only to the customer whose session placed it; anyone else sees a 404, not a hint.
 */
export default async function OrderStatusPage({ params, searchParams }: Props) {
  const [{ slug, orderId }, sp] = await Promise.all([params, searchParams])
  if (!UUID.test(orderId)) notFound()
  const [{ restaurant, outlet }, lang, session, order] = await Promise.all([
    loadRestaurant(slug), currentLang(), getSession('customer'), getOrder(orderId),
  ])
  if (!order || order.restaurantId !== restaurant.id) notFound()
  if (!session || !order.customerId || order.customerId !== session.subjectId) notFound()

  const address = order.addressId
    ? (await listAddresses(order.customerId, restaurant.id)).find((a) => a.id === order.addressId)
    : undefined

  const awaiting = order.paymentMethod === 'upi_link' && order.paymentStatus === 'awaiting' && !isTerminal(order.status)
  const pendingLink = awaiting ? order.payments.find((p) => p.status === 'awaiting' && p.linkId) : undefined
  // ponytail: `payment` has no url column, so only the mock's link can be rebuilt here; a real
  // Razorpay short_url reaches the customer by SMS. Storing it is a one-column migration.
  const payHref = pendingLink?.linkId && vendorMode() === 'mock' ? `/mock/pay/${pendingLink.linkId}` : null

  const paymentKey = order.paymentStatus === 'paid'
    ? 'payment.paid'
    : order.paymentMethod === 'cod'
      ? 'payment.cod'
      : order.paymentMethod === 'pay_at_table'
        ? 'payment.payAtTable'
        : order.paymentStatus === 'awaiting' ? 'payment.awaiting' : 'payment.unpaid'

  return (
    <div className={styles.status}>
      {param(sp, 'withdrawn') === '1' && <Band tone="neutral" live="polite">{t('consent.withdrawn', lang)}</Band>}

      <div className={styles.statusHead} aria-live="polite" aria-atomic="true">
        <StateGlyph status={order.status} fulfilment={order.fulfilment} lang={lang} />
        <span className={`${styles.amount} num`}>{formatINR(paise(order.totalPaise))}</span>
        <StatusChip status={order.status} fulfilment={order.fulfilment} variant="outline" lang={lang} />
        <p className={styles.statusMsg}>
          {order.status === 'cancelled'
            ? t('status.cancelled', lang)
            : awaiting
              ? t('status.awaitingPayment', lang)
              : t('status.thanks', lang, { restaurant: restaurant.name })}
        </p>
        {order.tableNo && (
          <span className={styles.locator}>TABLE <span className="num">{order.tableNo}</span></span>
        )}
      </div>

      {awaiting && (
        payHref
          ? <Button href={payHref} variant="brand" size="counter" block>{t('status.payNow', lang, { amount: formatINR(paise(order.totalPaise)) })}</Button>
          : <p className={styles.note}>{t('status.paySms', lang)}</p>
      )}

      <section className={styles.card}>
        <ul className={styles.lines}>
          {order.items.map((item) => (
            <li key={item.id} className={styles.line}>
              <span className={`num ${styles.lineAmount}`}>{item.qty}×</span>
              <span className={styles.lineName}>{item.nameSnapshot}</span>
              <span className={`${styles.lineAmount} num`}>{formatINR(paise(item.unitPricePaise * item.qty))}</span>
            </li>
          ))}
        </ul>
        <div className={styles.totals}>
          {order.discountPaise > 0 && (
            <>
              <div className={styles.totalRow}><span>{t('cart.subtotal', lang)}</span><span className="num">{formatINR(paise(order.subtotalPaise))}</span></div>
              <div className={styles.totalRow}><span>{t('cart.discount', lang)}</span><span className="num">−{formatINR(paise(order.discountPaise))}</span></div>
            </>
          )}
          <div className={styles.totalRow}><strong>{t('cart.total', lang)}</strong><strong className="num">{formatINR(paise(order.totalPaise))}</strong></div>
          <div className={styles.totalRow}><span className={styles.kvLabel}>{t(paymentKey, lang)}</span></div>
        </div>
      </section>

      {address && (
        <section className={`${styles.card} ${styles.kv}`}>
          <span className={styles.kvLabel}>{t('checkout.deliverTo', lang)}</span>
          <span>{address.line1}{address.landmark ? `, ${address.landmark}` : ''}</span>
          <span className={styles.optionMeta}>{[address.area, address.pincode].filter(Boolean).join(' ')}</span>
        </section>
      )}

      {!isTerminal(order.status) && (
        <>
          <p className={styles.note}>{t('status.updates', lang)}</p>
          <StatusPoller orderId={order.id} status={order.status} paymentStatus={order.paymentStatus} />
        </>
      )}

      {isTerminal(order.status) && (
        <Button href={`/r/${slug}${order.tableNo ? `?t=${encodeURIComponent(order.tableNo)}` : ''}`} variant="ghost" block>
          {t('status.orderAgain', lang)}
        </Button>
      )}

      {/* Build Spec §10: withdrawal is a one-tap action on the ordering page. */}
      <form action={withdrawConsentAction} className={styles.withdraw}>
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="orderId" value={order.id} />
        <span>{orderStateLabel(order.status, order.fulfilment, lang)} · {outlet.name}</span>
        <button type="submit" className={styles.textBtn}>{t('consent.withdraw', lang)}</button>
      </form>
    </div>
  )
}
