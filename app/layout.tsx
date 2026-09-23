import type { Metadata, Viewport } from 'next'
import { cookies } from 'next/headers'
import type { ReactNode } from 'react'
import { LANG_COOKIE, isLang } from '@/ui/lang.ts'
import { AGENT_THEME_COOKIE, THEME_COOKIE } from '@/ui/theme.ts'
import './globals.css'

export const metadata: Metadata = {
  title: 'ServeLine',
  description: 'Direct ordering for Indian restaurants.',
}

// Design §9: zoom is never disabled, so no maximumScale / userScalable here.
// viewportFit: cover is what makes env(safe-area-inset-bottom) non-zero for the cart bar.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

/**
 * The one root layout. Density is set per route group on a wrapper <div data-density>, not
 * here, because Next has a single <html> and the three surfaces need three densities.
 *
 * `<html lang>` follows the language cookie (design §9: "<html lang> follows the selected
 * language"), which the ordering page's <select> sets; "en" until then.
 *
 * `data-theme` is the staff manual light/dark toggle (ADR 0002 §3). tokens.css keys the theme on
 * `:root[data-theme]`, so it has to be set here.
 *
 * There are two theme cookies, not one, and the path scoping is the mechanism rather than an
 * accident. `sl_theme` is scoped to /app and `sl_theme_agent` to /agent, so the browser sends
 * each only on its own surface and neither is ever sent on /r/{slug} — which is what makes the
 * customer ordering page follow the OS, as ADR 0002 §3 requires. Widening either to path `/`
 * would leak a staff choice onto a customer's phone.
 *
 * Only one can arrive on any given request, so reading both cannot conflict.
 */
export default async function RootLayout({ children }: { children: ReactNode }) {
  const jar = await cookies()
  const chosen = jar.get(LANG_COOKIE)?.value
  const theme = jar.get(THEME_COOKIE)?.value ?? jar.get(AGENT_THEME_COOKIE)?.value
  return (
    <html lang={isLang(chosen) ? chosen : 'en'} data-theme={theme === 'dark' || theme === 'light' ? theme : undefined}>
      <body>{children}</body>
    </html>
  )
}
