import type { ReactNode } from 'react'
import { t, type Lang } from './i18n.ts'
import styles from './EmptyState.module.css'

type Props = { lang: Lang } & (
  | {
      /** Dashboard, no orders ever. Teaches the interface. */
      kind: 'first-run'
      /** The "Preview my page" button and the QR to print. */
      action?: ReactNode
    }
  | {
      /** Dashboard, no active orders. Quiet: a busy operator sees this ten times a day. */
      kind: 'all-done'
      ordersToday: number
    }
  | {
      /** Agent-console filters, menu search. Names the query and the filter, offers the escape. */
      kind: 'zero-result'
      things: string
      query: string
      filter: string
      /** The "Clear filters" control, typically a link to the unfiltered route. */
      action?: ReactNode
    }
)

/** Design §7.9: three distinct kinds. Never "Nothing here." */
export function EmptyState(props: Props) {
  const { lang } = props
  switch (props.kind) {
    case 'first-run':
      return (
        <section className={`${styles.box} ${styles.firstRun}`}>
          <p className={styles.lead}>{t('empty.firstRun', lang)}</p>
          {props.action && <div className={styles.action}>{props.action}</div>}
        </section>
      )
    case 'all-done':
      return (
        <p className={`${styles.box} ${styles.allDone}`}>
          {t('empty.allDone', lang, { n: props.ordersToday })}
        </p>
      )
    case 'zero-result':
      return (
        <section className={`${styles.box} ${styles.zeroResult}`}>
          <p className={styles.lead}>
            {t('empty.zeroResult', lang, { things: props.things, query: props.query, filter: props.filter })}
          </p>
          {props.action && <div className={styles.action}>{props.action}</div>}
        </section>
      )
  }
}
