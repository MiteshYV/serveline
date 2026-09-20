'use client'

import { useState } from 'react'
import { t, type Lang } from './i18n.ts'
import styles from './QtyStepper.module.css'

type Props = {
  qty: number
  /** Called with 0 when the customer removes the line. */
  onChange: (qty: number) => void
  /** Used in the remove button's accessible name: "Remove Paneer Tikka". */
  itemName: string
  lang: Lang
  /** 44px (customer) or 56px (counter) targets (design §7.7). */
  size?: 'customer' | 'counter'
  max?: number
}

/**
 * Design §7.7: `[ − ] [ 4 ] [ + ]`. At 1 the minus becomes remove — a disabled minus strands the
 * user. Tap the number to type; no long-press-to-repeat. At the max, a visible message rather
 * than a silently disabled button. The number is `aria-live="polite"`.
 */
export function QtyStepper({ qty, onChange, itemName, lang, size = 'customer', max = 20 }: Props) {
  const [draft, setDraft] = useState<string | null>(null)
  const atMax = qty >= max
  const editing = draft !== null

  function commit() {
    if (draft === null) return
    const n = Number.parseInt(draft, 10)
    setDraft(null)
    if (!Number.isInteger(n)) return
    onChange(Math.min(Math.max(n, 0), max))
  }

  return (
    <div className={`${styles.wrap} ${styles[size]}`}>
      <div className={styles.stepper} role="group" aria-label={t('qty.label', lang)}>
        <button
          type="button"
          className={styles.btn}
          onClick={() => onChange(qty - 1)}
          aria-label={qty <= 1 ? t('menu.remove', lang, { item: itemName }) : t('qty.decrease', lang)}
        >
          {qty <= 1 ? <TrashGlyph /> : <MinusGlyph />}
        </button>

        {editing ? (
          <input
            className={`${styles.number} ${styles.input} num`}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={3}
            value={draft}
            autoFocus
            aria-label={t('qty.label', lang)}
            onChange={(e) => setDraft(e.target.value.replace(/\D/g, ''))}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit()
              if (e.key === 'Escape') setDraft(null)
            }}
          />
        ) : (
          <button
            type="button"
            className={`${styles.number} num`}
            onClick={() => setDraft(String(qty))}
            // The name carries the value too (design §9): "Quantity: 4", not a bare "Quantity".
            aria-label={`${t('qty.label', lang)}: ${qty}`}
          >
            <span aria-live="polite" aria-atomic="true">
              {qty}
            </span>
          </button>
        )}

        <button
          type="button"
          className={styles.btn}
          onClick={() => {
            if (!atMax) onChange(qty + 1)
          }}
          aria-label={t('qty.increase', lang)}
          aria-disabled={atMax || undefined}
        >
          <PlusGlyph />
        </button>
      </div>
      {atMax && (
        <p className={styles.max} role="status">
          {t('qty.max', lang, { max })}
        </p>
      )}
    </div>
  )
}

function MinusGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function PlusGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function TrashGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M2.5 4h11M6 4V2.5h4V4M4 4l.8 9.5h6.4L12 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
