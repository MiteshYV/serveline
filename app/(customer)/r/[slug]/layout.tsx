import type { ReactNode } from 'react'
import { brandStyle, normaliseBrand } from '@/ui/brand.ts'
import { t } from '@/ui/i18n.ts'
import { LangSelect } from './LangSelect.tsx'
import { currentLang, loadRestaurant } from './lib.ts'
import styles from './customer.module.css'

/**
 * The customer surface's frame for every `/r/{slug}` route: the restaurant's colour as a header
 * band and nowhere else (design §3.5), the language <select> (design §9), and a one-line
 * ServeLine credit (design §11.21). The four brand tokens ship as an inline <style> in the head
 * (design §10), computed here — the raw hex never reaches the DOM.
 */
export default async function RestaurantLayout({
  children,
  params,
}: {
  children: ReactNode
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const [{ restaurant }, lang] = await Promise.all([loadRestaurant(slug), currentLang()])
  const css = brandStyle(normaliseBrand(restaurant.brandColour))

  return (
    <div className={styles.shell} data-brand="" lang={lang}>
      <style href={`brand-${slug}`} precedence="brand">{css}</style>
      <header className={styles.band}>
        <a href={`/r/${slug}`} className={styles.bandTitle}>{restaurant.name}</a>
        <LangSelect lang={lang} />
      </header>
      <main className={styles.main}>{children}</main>
      <footer className={styles.footer}>{t('footer.credit', lang)}</footer>
    </div>
  )
}
