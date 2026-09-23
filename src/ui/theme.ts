/**
 * The manual light/dark choice, ADR 0002 §3.
 *
 * Staff surfaces get a toggle because a counter tablet's lighting has nothing to do with the
 * tablet's OS setting — a kitchen is bright at noon and dim at 11pm, and the device never hears
 * about it. The customer ordering page deliberately has none: it follows the phone, because a
 * customer is trying to order food, not configure a theme.
 *
 * That rule is enforced by cookie path rather than by a check. Each staff surface has its own
 * cookie scoped to its own prefix, so the browser sends it only there and never on /r/{slug}.
 * Widening either to path `/` would put a staff choice on a customer's phone.
 */

export const THEME_COOKIE = 'sl_theme'
export const AGENT_THEME_COOKIE = 'sl_theme_agent'

export type Theme = 'os' | 'light' | 'dark'

/** `os` is the absence of the cookie, which is what `:root:not([data-theme="light"])` needs. */
export const THEMES: readonly Theme[] = ['os', 'light', 'dark'] as const

export function isTheme(v: unknown): v is Theme {
  return v === 'os' || v === 'light' || v === 'dark'
}

const YEAR = 365 * 86_400

export const THEME_COOKIE_OPTIONS = { path: '/app', sameSite: 'lax' as const, maxAge: YEAR }
export const AGENT_THEME_COOKIE_OPTIONS = { path: '/agent', sameSite: 'lax' as const, maxAge: YEAR }
