import { priceableLines, type CartItemInput, type PricedMenuItem } from '@/core/cart.ts'
import { paise } from '@/core/money.ts'

/**
 * The cart as the browser holds it: ids and quantities only, in localStorage keyed by slug and
 * context (a table's cart is not the delivery cart). Prices are never stored — the server
 * re-prices every line from ids (Build Spec §6). Shared by the menu and the confirm step; both
 * are client components, this file is plain functions.
 *
 * Every localStorage touch is wrapped: private windows, cleared site data and Safari's ITP all
 * throw or return nothing, and the page must still work.
 */

/** What the page sends the client: the published menu in the shape `priceCart` reads, plus display fields. */
export type ItemView = PricedMenuItem & {
  description: string | null
  isVeg: boolean
  isAvailable: boolean
}

export type CategoryView = { id: string; name: string; items: ItemView[] }

export const storageKey = (slug: string, contextKey: string) => `sl_cart:${slug}:${contextKey}`

export function loadCart(key: string): CartItemInput[] {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (l): l is CartItemInput =>
        typeof l === 'object' && l !== null
        && typeof (l as CartItemInput).itemId === 'string'
        && Number.isInteger((l as CartItemInput).qty)
        && Array.isArray((l as CartItemInput).optionIds),
    )
  } catch {
    return []
  }
}

export function saveCart(key: string, lines: CartItemInput[]): void {
  try {
    if (lines.length === 0) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(lines))
  } catch {
    /* storage unavailable: the cart lives in memory for this page */
  }
}

/** Two lines are the same line when item, variant and options agree. */
export const sameLine = (a: CartItemInput, b: CartItemInput) =>
  a.itemId === b.itemId
  && (a.variantId ?? '') === (b.variantId ?? '')
  && [...a.optionIds].sort().join(',') === [...b.optionIds].sort().join(',')

/**
 * What `priceCart` reads: available items only, so a sold-out item in a stale cart is refused
 * by pricing itself (the same rule as repos/menu.ts's `toPricedMenu`, which cannot be imported
 * here because that module opens the database).
 */
export const toPriced = (categories: CategoryView[]): PricedMenuItem[] =>
  categories.flatMap((c) => c.items).filter((i) => i.isAvailable).map((i) => ({
    id: i.id,
    name: i.name,
    pricePaise: paise(i.pricePaise),
    variants: i.variants,
    optionGroups: i.optionGroups,
  }))

/**
 * Drops lines that today's menu no longer accepts — item sold out, variant retired, and (finding
 * unpriceable-cart-line-kills-cart) a line whose ids all still resolve but which `priceCart`
 * refuses because a group was made required, a maximum was lowered or a delta now outruns the
 * base price. Checking the ids alone let such a line through and it threw for the whole cart.
 * Core's `priceableLines` is the one authority, so this cannot drift from what checkout will do.
 */
export const prune = priceableLines
