import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import { vendorMode } from '@/adapters/mode.ts'
import { mockPayments } from '@/adapters/payments/mock.ts'
import { formatINR, paise } from '@/core/money.ts'
import { getOrder, getRestaurant } from '@/db/repos/index.ts'
import { Button } from '@/ui/Button.tsx'
import { t } from '@/ui/i18n.ts'
import { isLang, LANG_COOKIE } from '@/ui/lang.ts'
import { payMock } from './actions.ts'
import styles from './pay.module.css'

export const metadata: Metadata = { title: 'Demo payment' }

/**
 * The mock gateway's payment page (M1 design, "Adapters": a "pay" button fires a realistic signed
 * webhook). A plain UPI-app lookalike (design §2): the amount, who is being paid, one confirm.
 * Exists only under VENDOR_MODE=mock; the real link is Razorpay's hosted page.
 */
export default async function MockPayPage({ params }: { params: Promise<{ linkId: string }> }) {
  if (vendorMode() !== 'mock') notFound()
  const { linkId } = await params
  const link = mockPayments.get(linkId)
  if (!link) notFound()

  const [order, restaurant, jar] = await Promise.all([getOrder(link.orderId), getRestaurant(link.restaurantId), cookies()])
  if (!order || !restaurant) notFound()
  const l = jar.get(LANG_COOKIE)?.value
  const lang = isLang(l) ? l : 'en'
  const statusHref = `/r/${restaurant.slug}/order/${order.id}`
  const amount = formatINR(paise(link.amountPaise))
  // A superseded or converted-to-cash link is closed at the gateway (finding
  // superseded-payment-link-still-payable); it must not offer a pay button that then throws.
  const expired = link.status === 'cancelled' || (link.status === 'created' && Date.now() > link.expiresAt.getTime())

  return (
    <div className={styles.page} data-density="comfort" lang={lang}>
      <p className={styles.eyebrow}>{t('mock.title', lang)}</p>
      <p className={styles.payee}>{t('mock.paying', lang, { restaurant: restaurant.name })}</p>
      <p className={`${styles.amount} num`}>{amount}</p>
      <p className={styles.note}>{t('mock.note', lang)}</p>

      {link.status === 'paid' ? (
        <>
          <p className={styles.state}>{t('mock.paid', lang)}</p>
          <Button href={statusHref} variant="primary" size="counter" block>{t('mock.backToOrder', lang)}</Button>
        </>
      ) : expired ? (
        <>
          <p className={styles.state}>{t('mock.expired', lang)}</p>
          <Button href={statusHref} variant="primary" size="counter" block>{t('mock.backToOrder', lang)}</Button>
        </>
      ) : (
        <form action={payMock} className={styles.actions}>
          <input type="hidden" name="linkId" value={linkId} />
          <Button type="submit" variant="primary" size="counter" block>{t('mock.pay', lang, { amount })}</Button>
          <Button href={statusHref} variant="ghost" size="counter" block>{t('common.cancel', lang)}</Button>
        </form>
      )}
    </div>
  )
}
