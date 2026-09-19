'use client'

import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import c from '../console.module.css'

/** A plain link that knows whether it is the current section, for `aria-current`. */
export function NavLink({ href, children }: { href: string; children: ReactNode }) {
  const path = usePathname()
  const current = href === '/agent' ? path === '/agent' || path.startsWith('/agent/restaurants') : path.startsWith(href)
  return (
    <a href={href} className={c.navLink} aria-current={current ? 'page' : undefined}>
      {children}
    </a>
  )
}
