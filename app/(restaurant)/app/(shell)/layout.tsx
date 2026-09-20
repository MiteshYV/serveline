import type { ReactNode } from 'react'
import { Button } from '@/ui/Button.tsx'
import { td } from '@/ui/i18n-dashboard.ts'
import { readLang } from '../_lib/prefs.ts'
import { currentOutlet } from '../_lib/session.ts'
import { signOut } from './actions.ts'
import { Nav, type NavItem } from './Nav.tsx'
import styles from './Shell.module.css'

/**
 * The authenticated dashboard shell (Build Spec §7). Everything under /app except /app/login
 * lives inside this group, so `currentOutlet()` — and its redirect — runs once per request here.
 * Build Spec §10: `staff` cannot change settings or billing, so those two links are the owner's.
 */
export default async function ShellLayout({ children }: { children: ReactNode }) {
  const { restaurant, outlet, session } = await currentOutlet()
  const lang = await readLang()

  const items: NavItem[] = [
    { href: '/app', label: td('nav.board', lang) },
    { href: '/app/orders/new', label: td('nav.newOrder', lang) },
    { href: '/app/menu', label: td('nav.menu', lang) },
    { href: '/app/cards', label: td('nav.cards', lang) },
    { href: '/app/today', label: td('nav.today', lang) },
    { href: '/app/settings', label: td('nav.settings', lang) },
    ...(session.role === 'owner' ? [{ href: '/app/billing', label: td('nav.billing', lang) } as NavItem] : []),
  ]

  return (
    <div className={styles.shell} lang={lang}>
      <header className={styles.header}>
        <div className={styles.rail} aria-hidden="true" />
        <div className={styles.bar}>
          <span className={styles.wordmark}>ServeLine</span>
          <span className={styles.restaurant}>
            {restaurant.name} · {outlet.name}
          </span>
          <form action={signOut}>
            <Button variant="ghost" size="counter" type="submit">{td('login.signOut', lang)}</Button>
          </form>
        </div>
        <Nav items={items} label={td('nav.board', lang)} />
      </header>
      <main className={styles.main}>{children}</main>
    </div>
  )
}
