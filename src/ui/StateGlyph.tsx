import type { Fulfilment, OrderStatus } from '../core/orders.ts'
import { orderStateLabel, type Lang } from './i18n.ts'
import styles from './StateGlyph.module.css'

/**
 * The six enamel tones (design §3.2) and which of the ten order statuses (Build Spec §4) wears
 * each. Six tokens, ten statuses: the mapping is a judgement recorded here once so the glyph,
 * the chip and the card edge cannot disagree.
 *
 *  - `confirmed` and `awaiting_payment` are still "new" from the counter's point of view: the
 *    kitchen has not started. They keep the received blue and the one-segment glyph.
 *  - `address_pending` is a delivery order the kitchen may start on; it is pinned rather than
 *    alarmed (design §7.1), so it also stays blue.
 *  - `out_for_delivery` is after the kitchen is done: all three segments filled, ready green.
 */
export type StateTone = 'received' | 'preparing' | 'ready' | 'delivered' | 'attention' | 'cancelled'

export function toneOf(status: OrderStatus): StateTone {
  switch (status) {
    case 'received':
    case 'confirmed':
    case 'awaiting_payment':
    case 'address_pending':
      return 'received'
    case 'preparing':
      return 'preparing'
    case 'ready':
    case 'out_for_delivery':
      return 'ready'
    case 'delivered':
      return 'delivered'
    case 'needs_attention':
      return 'attention'
    case 'cancelled':
      return 'cancelled'
  }
}

type Props = {
  status: OrderStatus
  /** Only changes the <title> of a delivered glyph (ADR 0002 §6). */
  fulfilment?: Fulfilment
  lang?: Lang
  /** True when a visible text label sits beside the glyph, so screen readers hear it once. */
  decorative?: boolean
}

/**
 * Design §3.3: shape, not colour alone. The first three are a 3-segment progress bar, legible in
 * monochrome and to someone who reads none of the three languages. Inline SVG, ~80 bytes each —
 * never an icon font, never an emoji. Colour is `currentColor`, set by the parent.
 */
export function StateGlyph({ status, fulfilment = 'delivery', lang = 'en', decorative = false }: Props) {
  const tone = toneOf(status)
  const title = orderStateLabel(status, fulfilment, lang)
  const a11y = decorative ? { 'aria-hidden': true as const } : { role: 'img' as const }
  const common = { className: styles.glyph, width: 16, height: 16, viewBox: '0 0 16 16', ...a11y }

  switch (tone) {
    case 'received':
    case 'preparing':
    case 'ready': {
      const filled = tone === 'received' ? 1 : tone === 'preparing' ? 2 : 3
      return (
        <svg {...common}>
          <title>{title}</title>
          {[0, 1, 2].map((i) =>
            i < filled ? (
              <rect key={i} x={i * 6} y="3" width="4" height="10" fill="currentColor" />
            ) : (
              <rect key={i} x={i * 6 + 0.75} y="3.75" width="2.5" height="8.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
            ),
          )}
        </svg>
      )
    }
    case 'delivered':
      return (
        <svg {...common}>
          <title>{title}</title>
          <path d="M2.5 8.5l3.5 3.5 7.5-7.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    case 'attention':
      return (
        <svg {...common}>
          <title>{title}</title>
          <path d="M8 1.5L15 14.5H1z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          <path d="M8 6v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <circle cx="8" cy="12.3" r="1.1" fill="currentColor" />
        </svg>
      )
    case 'cancelled':
      return (
        <svg {...common}>
          <title>{title}</title>
          <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      )
  }
}
