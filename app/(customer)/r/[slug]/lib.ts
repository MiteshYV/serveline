import { cookies, headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { cache } from 'react'
import type { PageContext } from '@/checkout/place-order.ts'
import { getRestaurantBySlug } from '@/db/repos/index.ts'
import type { Lang } from '@/ui/i18n.ts'
import { isLang, LANG_COOKIE } from '@/ui/lang.ts'

/**
 * What every `/r/{slug}` route needs first. `cache` dedupes the read between the layout (brand
 * tokens, header) and the page within one request. `/r/{slug}` has no outlet in the URL
 * (Build Spec §6), so it is the restaurant's first outlet — one outlet per restaurant at M1.
 */
export const loadRestaurant = cache(async (slug: string) => {
  const restaurant = await getRestaurantBySlug(slug)
  const outlet = restaurant?.outlets[0]
  if (!restaurant || !outlet) notFound()
  return { restaurant, outlet }
})

export async function currentLang(): Promise<Lang> {
  const v = (await cookies()).get(LANG_COOKIE)?.value
  return isLang(v) ? v : 'en'
}

export type SearchParams = Record<string, string | string[] | undefined>

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? ''

/**
 * Design §7.4: the table-vs-delivery split is decided from the URL at load and never asked.
 * `t` wins if both are present — a diner at a table is at a table.
 */
export function parseContext(sp: SearchParams): PageContext {
  const t = first(sp.t).trim()
  if (/^[A-Za-z0-9-]{1,16}$/.test(t)) return { kind: 'table', tableNo: t }
  const c = first(sp.c).trim().toUpperCase()
  return /^[A-Z0-9]{1,32}$/.test(c) ? { kind: 'delivery', code: c } : { kind: 'delivery' }
}

/** The query string that carries the context from page to page. */
export const contextQuery = (ctx: PageContext): string =>
  ctx.kind === 'table' ? `t=${encodeURIComponent(ctx.tableNo)}` : ctx.code ? `c=${encodeURIComponent(ctx.code)}` : ''

export const withQuery = (path: string, ...parts: string[]) => {
  const qs = parts.filter(Boolean).join('&')
  return qs ? `${path}?${qs}` : path
}

export const param = (sp: SearchParams, name: string): string => first(sp[name])

/** This deployment's origin, for absolute links in SMS and for the mock page's self-call. */
export async function origin(): Promise<string> {
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000'
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  return `${proto}://${host}`
}

export async function clientIp(): Promise<string | undefined> {
  const h = await headers()
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || undefined
}
