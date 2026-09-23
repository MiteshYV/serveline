import { formatINR, paise } from '../core/money.ts'
import { t, type Lang } from './i18n.ts'
import styles from './CartBar.module.css'

type Props = {
  count: number
  totalPaise: number
  /** Where the bar goes: the cart route or a `#cart` anchor. The whole bar is one tap target. */
  href: string
  lang: Lang
  /** Overrides "View cart" — the terminal step reads "Send to kitchen" / "Continue to address" (design §7.4). */
  label?: string
}

/** Apply to the scrolling menu list so the fixed bar never eats its last row (design §7.4). */
export const cartReserveClass = styles.reserve

/**
 * Design §7.4: a persistent bottom bar, 64px + safe-area, inverse steel ground, one tap
 * target. Not rendered at all when the cart is empty — no "0 items" bar.
 */
export function CartBar({ count, totalPaise, href, lang, label }: Props) {
  if (count <= 0) return null
  return (
    // data-motion="fade" keeps the arrival perceptible under prefers-reduced-motion by restoring
    // opacity alone at 100ms (tokens.css). The translate is deliberately not restored — a bar that
    // slides is exactly what that setting exists to prevent — so it simply appears in place.
    <a href={href} className={styles.bar} data-motion="fade">
      <span className={styles.summary}>
        <span className="num">{count}</span> {t(count === 1 ? 'cart.itemWord' : 'cart.itemsWord', lang)}
        <span className={styles.dot} aria-hidden="true">
          ·
        </span>
        <span className="num">{formatINR(paise(totalPaise))}</span>
      </span>
      <span className={styles.cta}>
        {label ?? t('cart.view', lang)} <span aria-hidden="true">→</span>
      </span>
    </a>
  )
}
