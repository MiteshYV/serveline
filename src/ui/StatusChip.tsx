import type { Fulfilment, OrderStatus } from '../core/orders.ts'
import { orderStateLabel, type Lang } from './i18n.ts'
import { StateGlyph, toneOf } from './StateGlyph.tsx'
import styles from './StatusChip.module.css'

type Props = {
  status: OrderStatus
  fulfilment: Fulfilment
  /** `filled` is for the counter dashboard only; the customer surface and dense tables use `outline` (design §7.2, §3.5). */
  variant: 'filled' | 'outline'
  lang: Lang
  className?: string
}

/**
 * Design §7.2: a 4px-radius rectangle — a plate, never a pill. Glyph + label; the label is the
 * STATE ("Ready"), never the action ("Mark ready"). Height follows the surrounding density.
 */
export function StatusChip({ status, fulfilment, variant, lang, className }: Props) {
  const label = orderStateLabel(status, fulfilment, lang)
  return (
    <span
      className={`${styles.chip} ${styles[variant]}${className ? ` ${className}` : ''}`}
      data-tone={toneOf(status)}
      data-status={status}
    >
      <StateGlyph status={status} fulfilment={fulfilment} lang={lang} decorative />
      <span className={styles.label}>{label}</span>
    </span>
  )
}
