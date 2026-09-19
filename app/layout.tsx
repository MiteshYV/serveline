import type { Metadata, Viewport } from 'next'
import { cookies } from 'next/headers'
import type { ReactNode } from 'react'
import { LANG_COOKIE, isLang } from '@/ui/lang.ts'
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
 * `data-theme` is the dashboard's manual light/dark toggle (ADR 0002 §3). tokens.css keys the
 * theme on `:root[data-theme]`, so it has to be set here; the `sl_theme` cookie is path-scoped
 * to /app, which is why /r/{slug} never receives it and the customer page follows the OS.
 */
export default async function RootLayout({ children }: { children: ReactNode }) {
  const jar = await cookies()
  const chosen = jar.get(LANG_COOKIE)?.value
  const theme = jar.get('sl_theme')?.value
  return (
    <html lang={isLang(chosen) ? chosen : 'en'} data-theme={theme === 'dark' || theme === 'light' ? theme : undefined}>
      <body>{children}</body>
    </html>
  )
}
