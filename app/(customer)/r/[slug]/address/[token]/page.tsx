import type { Metadata } from 'next'
import { verifyAddressToken } from '@/auth/jwt.ts'
import { hasValidConsent } from '@/core/consent.ts'
import { getConsent, getCustomer, getOrder, listAddresses } from '@/db/repos/index.ts'
import { Band } from '@/ui/Band.tsx'
import { Button } from '@/ui/Button.tsx'
import { Field } from '@/ui/Field.tsx'
import fieldStyles from '@/ui/Field.module.css'
import { t } from '@/ui/i18n.ts'
import { noticeHtml } from '@/ui/notice.ts'
import { currentLang, loadRestaurant, param, type SearchParams } from '../../lib.ts'
import { confirmAddressAction } from './actions.ts'
import styles from '../../customer.module.css'

type Props = { params: Promise<{ slug: string; token: string }>; searchParams: Promise<SearchParams> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [{ restaurant }, lang] = await Promise.all([loadRestaurant((await params).slug), currentLang()])
  return { title: `${t('address.confirmTitle', lang)} · ${restaurant.name}` }
}

/**
 * `/r/{slug}/address/{token}` — Build Spec §6: "opens the address form for a specific
 * `address_pending` order, pre-filled with the rough text. Confirming moves the order to
 * `confirmed`." The token is a signed JWT (src/auth/jwt.ts `signAddressToken`), minted by
 * whoever sends the address-link SMS — the dashboard's "Get address" or, at M2, the voice service.
 */
export default async function AddressLinkPage({ params, searchParams }: Props) {
  const [{ slug, token }, sp] = await Promise.all([params, searchParams])
  const [{ restaurant, outlet }, lang] = await Promise.all([loadRestaurant(slug), currentLang()])
  const err = param(sp, 'err')

  const orderId = await verifyAddressToken(token)
  const order = orderId ? await getOrder(orderId) : null
  const customer = order?.customerId ? await getCustomer(order.customerId) : null
  const tel = outlet.displayPhone ?? outlet.ownerMobile

  if (!order || !customer || order.restaurantId !== restaurant.id || order.status !== 'address_pending') {
    return (
      <div className={styles.step}>
        <h2 className={styles.stepTitle}>{t('address.confirmTitle', lang)}</h2>
        <Band tone="attention" live="off">{t('address.linkInvalid', lang)}</Band>
        {tel && <Button href={`tel:${tel}`} variant="brand" block>{t('address.call', lang, { restaurant: restaurant.name })}</Button>}
      </div>
    )
  }

  // The rough address the call captured, if the order points at one; otherwise the order's notes.
  const rough = order.addressId
    ? (await listAddresses(customer.id, restaurant.id)).find((a) => a.id === order.addressId)
    : undefined
  const consent = await getConsent(customer.id, restaurant.id)
  const needsConsent = !hasValidConsent(
    consent ? { noticeVersion: consent.noticeVersion, purposes: consent.purposes, withdrawnAt: consent.withdrawnAt } : undefined,
    'order_fulfilment',
  )

  return (
    <div className={styles.step}>
      <h2 className={styles.stepTitle}>{t('address.confirmTitle', lang)}</h2>
      {err === 'pincode' && (
        <Band
          tone="attention"
          action={tel && <Button href={`tel:${tel}`} variant="ghost">{t('address.call', lang, { restaurant: restaurant.name })}</Button>}
        >
          {t('address.notServed', lang, { restaurant: restaurant.name, pincode: param(sp, 'pin') })}
        </Band>
      )}
      <form action={confirmAddressAction} className={styles.form}>
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="token" value={token} />
        {err === 'address' && <p className={styles.error} role="alert">{t('address.pincodeInvalid', lang)}</p>}
        <Field id="line1" label={t('address.line1', lang)}>
          {(input) => <input {...input} name="line1" className={fieldStyles.control} required minLength={3} maxLength={200} defaultValue={rough?.line1 ?? order.notes ?? ''} autoComplete="street-address" />}
        </Field>
        <Field id="landmark" label={t('address.landmark', lang)}>
          {(input) => <input {...input} name="landmark" className={fieldStyles.control} maxLength={120} defaultValue={rough?.landmark ?? ''} />}
        </Field>
        <Field id="area" label={t('address.area', lang)}>
          {(input) => <input {...input} name="area" className={fieldStyles.control} required minLength={2} maxLength={80} defaultValue={rough?.area ?? ''} autoComplete="address-level3" />}
        </Field>
        <Field id="pincode" label={t('address.pincode', lang)}>
          {(input) => (
            <input {...input} name="pincode" className={`${fieldStyles.control} num`} type="text" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required defaultValue={param(sp, 'pin') || rough?.pincode || ''} autoComplete="postal-code" />
          )}
        </Field>

        {needsConsent && (
          <>
            <div className={styles.card}>
              <div className={styles.notice} dangerouslySetInnerHTML={{ __html: noticeHtml(lang, restaurant.name) }} />
            </div>
            <label className={styles.check}>
              <input type="checkbox" name="agree" required />
              <span>{t('consent.label', lang, { restaurant: restaurant.name })}</span>
            </label>
          </>
        )}

        <Button type="submit" variant="brand" size="counter" block>{t('address.saveAndContinue', lang)}</Button>
      </form>
    </div>
  )
}
