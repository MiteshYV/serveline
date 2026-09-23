import type { ReactNode } from 'react'
import styles from './dashboard.module.css'

/**
 * The dashboard's page header. Deliberately the same shape as the platform console's
 * `PageHead` (app/(platform)/agent/bits.tsx) — optional crumbs, a real `<h1>`, optional meta,
 * optional trailing actions — so the two staff surfaces are built the same way. Every page in
 * this tree uses it, including the two that had no `<h1>` at all: the board and the order
 * detail. The sizes come from the density role tokens, so this reads at counter size here and
 * at dense size in the console.
 */
export function PageHead({ crumbs, title, meta, actions }: { crumbs?: ReactNode; title: ReactNode; meta?: ReactNode; actions?: ReactNode }) {
  return (
    <header className={styles.pageHead}>
      <div>
        {crumbs && <p className={styles.crumbs}>{crumbs}</p>}
        <h1 className={styles.title}>{title}</h1>
        {meta && <p className={styles.meta}>{meta}</p>}
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </header>
  )
}

/**
 * One panel, drawn one way: the --elev-1 card (design §5.3). `as="fieldset"` keeps the native
 * grouping semantics where the panel wraps form controls — a `<legend>` names the group for a
 * screen reader in a way an `<h2>` does not.
 */
export function Panel({
  title,
  actions,
  children,
  as = 'section',
}: {
  title: ReactNode
  actions?: ReactNode
  children: ReactNode
  as?: 'section' | 'fieldset'
}) {
  if (as === 'fieldset') {
    return (
      <fieldset className={styles.panel}>
        <legend className={styles.panelTitle}>{title}</legend>
        {children}
      </fieldset>
    )
  }
  return (
    <section className={styles.panel}>
      <div className={styles.panelHead}>
        <h2 className={styles.panelTitle}>{title}</h2>
        {actions && <div className={styles.actions}>{actions}</div>}
      </div>
      {children}
    </section>
  )
}
