import { cookies } from 'next/headers'
import type { NagCookie } from '@/core/aggregator-nag.ts'
import type { Lang } from '@/ui/i18n.ts'
import { LANG_COOKIE, isLang } from '@/ui/lang.ts'

/**
 * Per-device dashboard preferences, as cookies. Theme (ADR 0002 §3) and the Monday nag's skip
 * state are scoped to /app; the language cookie is the one the ordering page also sets
 * (`@/ui/lang.ts`, path /) — one device, one language, and the root layout reads it for
 * `<html lang>`. None is secret and none is customer data, so no table and no audit row.
 */
/** Re-exported from `@/ui/theme.ts`, which the root layout also reads. One name, one place. */
export { THEME_COOKIE } from '@/ui/theme.ts'
export const NAG_COOKIE = 'sl_nag'
export { LANG_COOKIE }

export const APP_COOKIE = { path: '/app', sameSite: 'lax' as const, maxAge: 365 * 86_400 }
export const SITE_COOKIE = { path: '/', sameSite: 'lax' as const, maxAge: 365 * 86_400 }

export async function readLang(): Promise<Lang> {
  const v = (await cookies()).get(LANG_COOKIE)?.value
  return isLang(v) ? v : 'en'
}

export async function readNagCookie(): Promise<NagCookie | null> {
  const raw = (await cookies()).get(NAG_COOKIE)?.value
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null ? (parsed as NagCookie) : null
  } catch {
    return null
  }
}
