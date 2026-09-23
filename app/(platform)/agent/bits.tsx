import type { ReactNode } from 'react'
import { Band } from '@/ui/Band.tsx'
import c from './console.module.css'

export function PageHead({ crumbs, title, meta, actions }: { crumbs?: ReactNode; title: ReactNode; meta?: ReactNode; actions?: ReactNode }) {
  return (
    <header className={c.pageHead}>
      <div>
        {crumbs && <p className={c.crumbs}>{crumbs}</p>}
        <h1 className={c.title}>{title}</h1>
        {meta && <p className={c.meta}>{meta}</p>}
      </div>
      {actions && <div className={c.actions}>{actions}</div>}
    </header>
  )
}

export function Panel({ title, actions, children }: { title: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className={c.panel}>
      <div className={c.panelHead}>
        <h2 className={c.panelTitle}>{title}</h2>
        {actions && <div className={c.actions}>{actions}</div>}
      </div>
      {children}
    </section>
  )
}

/** A steel label for anything that is not an order state: restaurant status, roles, milestones. */
export function Tag({ children, tone = 'default' }: { children: ReactNode; tone?: 'default' | 'strong' | 'quiet' }) {
  const cls = tone === 'strong' ? `${c.tag} ${c.tagStrong}` : tone === 'quiet' ? `${c.tag} ${c.tagQuiet}` : c.tag
  return <span className={cls}>{children}</span>
}

/** Design §7.10.1 / §11.15: a persistent band, never a toast. Dismissal is a link to the clean URL. */
export function ErrorBand({ message, dismissHref }: { message: string; dismissHref: string }) {
  return (
    <Band tone="attention" action={<a href={dismissHref} className={c.link}>Dismiss</a>}>
      {message}
    </Band>
  )
}
