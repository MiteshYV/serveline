import type { Metadata } from 'next'
import { getSession } from '@/auth/session.ts'
import { resolveCode } from '@/checkout/place-order.ts'
import { paise } from '@/core/money.ts'
import { getPublishedMenu } from '@/db/repos/index.ts'
import { Band } from '@/ui/Band.tsx'
import { Button } from '@/ui/Button.tsx'
import { Field } from '@/ui/Field.tsx'
import fieldStyles from '@/ui/Field.module.css'
import { t } from '@/ui/i18n.ts'
import type { CategoryView } from './cart.ts'
import { codeMessage } from './code-message.ts'
import { MenuClient } from './MenuClient.tsx'
import { contextQuery, currentLang, loadRestaurant, parseContext, withQuery, type SearchParams } from './lib.ts'
import styles from './customer.module.css'

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<SearchParams> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { restaurant } = await loadRestaurant((await params).slug)
  return { title: restaurant.name }
}

/**
 * `/r/{slug}` — Build Spec §6. Server-rendered menu; `?t=` is a table, `?c=` a delivery page
 * with a code. The code is applied automatically and validated with core `canRedeem`; a refused
 * one shows the menu without the discount and says why (Build Spec §6, "says so").
 */
export default async function MenuPage({ params, searchParams }: Props) {
  const [{ slug }, sp] = await Promise.all([params, searchParams])
  const [{ restaurant, outlet }, lang] = await Promise.all([loadRestaurant(slug), currentLang()])
  const ctx = parseContext(sp)
  const qs = contextQuery(ctx)

  const [menu, session] = await Promise.all([getPublishedMenu(outlet.id), getSession('customer')])

  const code = ctx.kind === 'delivery' && ctx.code
    ? await resolveCode(restaurant.id, ctx.code, session?.subjectId ?? null)
    : null

  const tel = outlet.displayPhone ?? outlet.ownerMobile
  if (!menu || menu.items.length === 0 || outlet.status !== 'active') {
    // Design §7.9: never an empty menu. A phone number is a way forward; a blank list is not.
    return (
      <div className={styles.empty}>
        <p>{t('menu.closed', lang)}</p>
        {tel && <Button href={`tel:${tel}`} variant="brand">{t('menu.callToOrder', lang)}</Button>}
      </div>
    )
  }

  const categories: CategoryView[] = menu.categories
    .filter((c) => c.items.length > 0)
    .map((c) => ({
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
          id: g.id,
          name: g.name,
          minSelect: g.minSelect,
          maxSelect: g.maxSelect,
          options: g.options.map((o) => ({ id: o.id, name: o.name, priceDeltaPaise: paise(o.priceDeltaPaise) })),
        })),
      })),
    }))

  return (
    <>
      <p className={styles.context}>
        <span className={styles.locator}>
          {ctx.kind === 'table' ? t('checkout.table', lang, { n: ctx.tableNo }) : t('checkout.delivery', lang)}
        </span>
        {' · '}{outlet.name}
      </p>

      {code && (
        // Not an order state, so a neutral band (palette law, design §3.2) whether applied or refused.
        <Band tone="neutral" live={code.ok ? 'off' : 'polite'} className="mx-[var(--space-16)] mt-[var(--space-12)] rounded-[var(--radius-3)]">
          {codeMessage(code, lang)}
        </Band>
      )}

      {ctx.kind === 'delivery' && !code?.ok && (
        // Build Spec §6: "code applied automatically from `c` or entered by hand". A GET form:
        // the URL is the state, and it costs no JavaScript.
        <form method="get" action={`/r/${slug}`} className={`${styles.toolbar} ${styles.codeForm}`}>
          <Field id="code" label={t('code.enter', lang)}>
            {(input) => (
              <input {...input} name="c" className={`${fieldStyles.control} num`} maxLength={32} autoCapitalize="characters" autoComplete="off" />
            )}
          </Field>
          <Button type="submit" variant="ghost" size="counter">{t('code.apply', lang)}</Button>
        </form>
      )}

      <MenuClient
        slug={slug}
        contextKey={ctx.kind === 'table' ? `table:${ctx.tableNo}` : 'delivery'}
        checkoutHref={withQuery(`/r/${slug}/checkout`, qs)}
        categories={categories}
        lang={lang}
        discountPercent={code?.ok ? code.percent : null}
      />
    </>
  )
}
