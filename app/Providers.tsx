'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { LinkProvider } from '@astryxdesign/core/Link'
import { Theme } from '@astryxdesign/core/theme'
import { neutralTheme } from '@astryxdesign/theme-neutral/built'

/**
 * The Astryx root (ADR 0010). `mode` comes from the server, read from the staff theme cookie in the
 * root layout, so the first paint is already in the right theme and the root `<Theme>`'s own sync
 * of `<html data-theme>` agrees with what the server wrote. `system` — no cookie — is what every
 * customer gets, which keeps ADR 0002 §3: the ordering page follows the phone.
 *
 * LinkProvider makes every Astryx `href` (Button, NavItem, Link) a Next.js `<Link>`.
 */
export function Providers({ mode, children }: { mode: 'light' | 'dark' | 'system'; children: ReactNode }) {
  return (
    <Theme theme={neutralTheme} mode={mode}>
      <LinkProvider component={Link}>{children}</LinkProvider>
    </Theme>
  )
}
