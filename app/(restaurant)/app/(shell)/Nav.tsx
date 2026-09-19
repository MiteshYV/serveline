'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import styles from './Shell.module.css'

export type NavItem = { href: '/app' | '/app/orders/new' | '/app/menu' | '/app/cards' | '/app/today' | '/app/settings' | '/app/billing'; label: string }

/** Counter targets (design §6.1): every link is 56px tall. The active page is marked by a steel underline, never a colour. */
export function Nav({ items, label }: { items: NavItem[]; label: string }) {
  const path = usePathname()
  return (
    <nav className={styles.nav} aria-label={label}>
      {items.map((it) => {
        const active = it.href === '/app' ? path === '/app' : path.startsWith(it.href)
        return (
          <Link key={it.href} href={it.href} className={styles.navLink} aria-current={active ? 'page' : undefined}>
            {it.label}
          </Link>
        )
      })}
    </nav>
  )
}
