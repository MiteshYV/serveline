import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { getSession } from '@/auth/session.ts'
import { resolveCode } from '@/checkout/place-order.ts'
import { hasValidConsent } from '@/core/consent.ts'
import { paise } from '@/core/money.ts'
import { getConsent, getCustomer, getPublishedMenu, listAddresses } from '@/db/repos/index.ts'
import { Band } from '@/ui/Band.tsx'
import { Button } from '@/ui/Button.tsx'
import { Field } from '@/ui/Field.tsx'
import fieldStyles from '@/ui/Field.module.css'
import { t, type Lang } from '@/ui/i18n.ts'
import { noticeHtml } from '@/ui/notice.ts'
import { PhoneInput } from '@/ui/PhoneInput.tsx'
import type { CategoryView } from '../cart.ts'
import { contextQuery, currentLang, loadRestaurant, param, parseContext, withQuery, type SearchParams } from '../lib.ts'
import { grantConsent, saveAddressAction, sendCode } from './actions.ts'
import { ConfirmStep } from './ConfirmStep.tsx'
import { OtpForm } from './OtpForm.tsx'
import { readOtp } from './otp-cookie.ts'
import styles from '../customer.module.css'

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<SearchParams> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [{ restaurant }, lang] = await Promise.all([loadRestaurant((await params).slug), currentLang()])
  return { title: `${t('checkout.title', lang)} · ${restaurant.name}` }
}

/**
 * `/r/{slug}/checkout` — Build Spec §6's flow after the menu: phone → OTP (skipped with a live
 * 30-day session) → consent (skipped once granted) → table or address → payment method. Each
 * screen is a full step with an indicator (design §7.4: items → phone/OTP → confirm); the URL
 * carries the context and the chosen address, the cookies carry the session and the pending OTP.
 */
export default async function CheckoutPage({ params, searchParams }: Props) {
  const [{ slug }, sp] = await Promise.all([params, searchParams])
  const [{ restaurant, outlet }, lang] = await Promise.all([loadRestaurant(slug), currentLang()])
  const ctx = parseContext(sp)
  const qs = contextQuery(ctx)
  const err = param(sp, 'err')
  const menuHref = withQuery(`/r/${slug}`, qs)
  const hidden = (
    <>
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="qs" value={qs} />
    </>
  )

  const session = await getSession('customer')
  const customer = session ? await getCustomer(session.subjectId) : null

  if (!customer) {
    const pending = await readOtp()
    if (pending) {
      return (
        <Step n={2} lang={lang} title={t('otp.label', lang)}>
          {err === 'ratelimit' && <Band tone="attention">{t('checkout.rateLimited', lang)}</Band>}
          <OtpForm slug={slug} qs={qs} lang={lang} phoneLocal={pending.p.slice(3)} devCode={pending.dev} issuedAt={pending.at} />
        </Step>
      )
    }
    return (
      <Step n={2} lang={lang} title={t('checkout.phone', lang)}>
        {err === 'ratelimit' && <Band tone="attention">{t('checkout.rateLimited', lang)}</Band>}
        <form action={sendCode} className={styles.form}>
          {hidden}
          <PhoneInput lang={lang} error={err === 'phone' ? t('login.phoneInvalid', lang) : undefined} autoFocus />
          <Button type="submit" variant="brand" size="counter" block>{t('login.sendCode', lang)}</Button>
        </form>
      </Step>
    )
  }

  const consent = await getConsent(customer.id, restaurant.id)
  const consentView = consent
    ? { noticeVersion: consent.noticeVersion, purposes: consent.purposes, withdrawnAt: consent.withdrawnAt }
    : undefined
  if (!hasValidConsent(consentView, 'order_fulfilment')) {
    return (
      <Step n={2} lang={lang} title={t('checkout.confirm', lang)}>
        <form action={grantConsent} className={styles.form}>
          {hidden}
          <div className={styles.card}>
            {/* Server-rendered from the versioned notice; the markup is ours, the words are the notice's. */}
            <div className={styles.notice} dangerouslySetInnerHTML={{ __html: noticeHtml(lang, restaurant.name) }} />
          </div>
          <label className={styles.check}>
            <input type="checkbox" name="agree" required />
            <span>{t('consent.label', lang, { restaurant: restaurant.name })}</span>
          </label>
          {err === 'consent' && <p className={styles.error} role="status">{t('consent.required', lang)}</p>}
          <Button type="submit" variant="brand" size="counter" block>{t('checkout.continue', lang)}</Button>
        </form>
      </Step>
    )
  }

  let address: Awaited<ReturnType<typeof listAddresses>>[number] | null = null
  if (ctx.kind === 'delivery') {
    const addresses = await listAddresses(customer.id, restaurant.id)
    address = addresses.find((a) => a.id === param(sp, 'a')) ?? null
    if (!address) {
      const tel = outlet.displayPhone ?? outlet.ownerMobile
      return (
        <Step n={3} lang={lang} title={t('checkout.address', lang)}>
          {err === 'pincode' && (
            // Design §7.10: a designed state with a way forward, not an error code.
            <Band
              tone="attention"
              action={tel && <Button href={`tel:${tel}`} variant="ghost">{t('address.call', lang, { restaurant: restaurant.name })}</Button>}
            >
              {t('address.notServed', lang, { restaurant: restaurant.name, pincode: param(sp, 'pin') })}
            </Band>
          )}
          {addresses.length > 0 && (
            <section className={styles.form} aria-labelledby="saved-h">
              <h3 id="saved-h" className={styles.subhead}>{t('address.saved', lang)}</h3>
              {addresses.map((a) => (
                <a key={a.id} href={withQuery(`/r/${slug}/checkout`, qs, `a=${a.id}`)} className={styles.option}>
                  <span className={styles.optionBody}>
                    <span>{a.line1}{a.landmark ? `, ${a.landmark}` : ''}</span>
                    <span className={styles.optionMeta}>{[a.area, a.pincode].filter(Boolean).join(' ')} · {t('address.deliverHere', lang)}</span>
                  </span>
                </a>
              ))}
              <hr className={styles.hr} />
            </section>
          )}
          <form action={saveAddressAction} className={styles.form}>
            {hidden}
            <h3 className={styles.subhead}>{t('address.new', lang)}</h3>
            {err === 'address' && <p className={styles.error} role="status">{t('address.pincodeInvalid', lang)}</p>}
            <Field id="line1" label={t('address.line1', lang)}>
              {(input) => <input {...input} name="line1" className={fieldStyles.control} required minLength={3} maxLength={200} autoComplete="street-address" />}
            </Field>
            <Field id="landmark" label={t('address.landmark', lang)}>
              {(input) => <input {...input} name="landmark" className={fieldStyles.control} maxLength={120} />}
            </Field>
            <Field id="area" label={t('address.area', lang)}>
              {(input) => <input {...input} name="area" className={fieldStyles.control} required minLength={2} maxLength={80} autoComplete="address-level3" />}
            </Field>
            <Field id="pincode" label={t('address.pincode', lang)} error={err === 'pincode' ? t('address.notServed', lang, { restaurant: restaurant.name, pincode: param(sp, 'pin') }) : undefined}>
              {(input) => (
                <input {...input} name="pincode" className={`${fieldStyles.control} num`} type="text" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required autoComplete="postal-code" defaultValue={param(sp, 'pin')} />
              )}
            </Field>
            <Button type="submit" variant="brand" size="counter" block>{t('address.saveAndContinue', lang)}</Button>
          </form>
        </Step>
      )
    }
  }

  const [menu, code] = await Promise.all([
    getPublishedMenu(outlet.id),
    ctx.kind === 'delivery' && ctx.code ? resolveCode(restaurant.id, ctx.code, customer.id) : null,
  ])
  const categories: CategoryView[] = (menu?.categories ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    items: c.items.map((i) => ({
      id: i.id,
      name: i.name,
      description: i.description,
      pricePaise: paise(i.pricePaise),
      isVeg: i.isVeg,
      isAvailable: i.isAvailable,
      variants: i.variants.map((v) => ({ id: v.id, name: v.name, priceDeltaPaise: paise(v.priceDeltaPaise) })),
      optionGroups: i.optionGroups.map((g) => ({
        id: g.id, name: g.name, minSelect: g.minSelect, maxSelect: g.maxSelect,
        options: g.options.map((o) => ({ id: o.id, name: o.name, priceDeltaPaise: paise(o.priceDeltaPaise) })),
      })),
    })),
  }))

  return (
    <Step n={3} lang={lang} title={t('checkout.confirm', lang)}>
      <ConfirmStep
        slug={slug}
        qs={qs}
        contextKey={ctx.kind === 'table' ? `table:${ctx.tableNo}` : 'delivery'}
        lang={lang}
        ctx={ctx}
        categories={categories}
        code={code}
        address={address ? { id: address.id, line1: address.line1, landmark: address.landmark, area: address.area, pincode: address.pincode } : null}
        codEnabled={outlet.codEnabled}
        menuHref={menuHref}
        changeAddressHref={withQuery(`/r/${slug}/checkout`, qs)}
      />
    </Step>
  )
}

/** Design §7.4: a full screen per step with a visible indicator. Three steps: items, phone/OTP, confirm. */
function Step({ n, lang, title, children }: { n: 2 | 3; lang: Lang; title: string; children: ReactNode }) {
  return (
    <div className={styles.step}>
      <p className={styles.stepIndicator}>{t('checkout.step', lang, { n, total: 3 })}</p>
      <h2 className={styles.stepTitle}>{title}</h2>
      {children}
    </div>
  )
}
