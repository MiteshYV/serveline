import type { ReactNode } from 'react'
import { formatINR, paise } from '../core/money.ts'
import { FssaiMark } from './FssaiMark.tsx'
import { t, type Lang } from './i18n.ts'
import { QtyStepper } from './QtyStepper.tsx'
import styles from './MenuItemRow.module.css'

export type MenuItemView = {
  id: string
  name: string
  description?: string | null
  pricePaise: number
  isVeg: boolean
  isAvailable: boolean
}

type Props = {
  item: MenuItemView
  lang: Lang
  /** Lines of this item already in the cart. */
  qty?: number
  /**
   * Present → the row shows ADD (qty 0) or the stepper (qty > 0). Absent → no control, which is
   * what a read-only listing wants. A function prop means the parent is a client component;
   * the menu list with cart state is one anyway.
   */
  onQtyChange?: (qty: number) => void
  /** Under the description: what is in the cart for this item ("Half × 2"), or nothing. */
  detail?: ReactNode
}

/**
 * Design §7.3. A <li>: the menu is a list. FSSAI mark leading; title 700 (dish names can be
 * Indic, so never 600); description clamped to 2 lines at line-height 1.45; price tabular.
 * ADD swaps in place for the stepper without changing row height — both are 44px.
 * Out of stock is a token change, never opacity (design §11.10).
 */
export function MenuItemRow({ item, lang, qty = 0, onQtyChange, detail }: Props) {
  const price = formatINR(paise(item.pricePaise))
  return (
    <li className={styles.row} data-unavailable={item.isAvailable ? undefined : true}>
      <FssaiMark veg={item.isVeg} lang={lang} />
      <div className={styles.body}>
        <span className={styles.title}>{item.name}</span>
        {item.description && <p className={styles.desc}>{item.description}</p>}
        {!item.isAvailable && <span className={styles.soldOut}>{t('menu.unavailable', lang)}</span>}
        {detail && <span className={styles.detail}>{detail}</span>}
      </div>
      <div className={styles.trail}>
        <span className={`${styles.price} num`}>{item.isAvailable ? price : <s>{price}</s>}</span>
        {onQtyChange && item.isAvailable && (
          <div className={styles.control}>
            {qty > 0 ? (
              <QtyStepper qty={qty} onChange={onQtyChange} itemName={item.name} lang={lang} />
            ) : (
              <button type="button" className={styles.add} onClick={() => onQtyChange(1)}>
                {t('menu.add', lang)}
              </button>
            )}
          </div>
        )}
      </div>
    </li>
  )
}
