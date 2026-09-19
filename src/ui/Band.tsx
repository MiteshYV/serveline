import type { ReactNode } from 'react'
import styles from './Band.module.css'

type Tone = 'attention' | 'received' | 'neutral'

type Props = {
  /**
   * attention — offline / request failed (design §7.10.1): attention wash + ink.
   * received  — new-order alert (design §8): received plate + white, may pulse 3 cycles.
   * neutral   — the Monday nag and anything that is not an order state (design §7.8): steel edge.
   */
  tone: Tone
  children: ReactNode
  /** A text button or link at the trailing edge: "Retry now", "Reopen". */
  action?: ReactNode
  /**
   * Design §9: exactly one assertive region product-wide, and it is the new-order band.
   * Defaults: received → assertive, attention → polite, neutral → none.
   */
  live?: 'assertive' | 'polite' | 'off'
  /** Design §8: exactly 3 attention cycles, then still. Only meaningful on `received`. */
  pulse?: boolean
  className?: string
}

/**
 * A persistent band in normal flow. Never a toast: a toast auto-dismisses on exactly the flaky
 * connection where the operator needed it (design §11.15). Removal is the caller's decision,
 * made by not rendering it.
 */
export function Band({ tone, children, action, live, pulse = false, className }: Props) {
  const region = live ?? (tone === 'received' ? 'assertive' : tone === 'attention' ? 'polite' : 'off')
  return (
    <div
      className={`${styles.band} ${styles[tone]}${pulse ? ` ${styles.pulse}` : ''}${className ? ` ${className}` : ''}`}
      role={region === 'assertive' ? 'alert' : region === 'polite' ? 'status' : undefined}
      aria-atomic={region === 'off' ? undefined : true}
    >
      <div className={styles.text}>{children}</div>
      {action && <div className={styles.action}>{action}</div>}
    </div>
  )
}
