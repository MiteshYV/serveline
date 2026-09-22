'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { CartError, priceCart, type CartItemInput } from '@/core/cart.ts'
import { formatINR, paise } from '@/core/money.ts'
import { Band } from '@/ui/Band.tsx'
import { Button } from '@/ui/Button.tsx'
import { CartBar, cartReserveClass } from '@/ui/CartBar.tsx'
import { Field } from '@/ui/Field.tsx'
import fieldStyles from '@/ui/Field.module.css'
import { t, type Lang, type UiKey } from '@/ui/i18n.ts'
import { MenuItemRow } from '@/ui/MenuItemRow.tsx'
import {
  loadCart, prune, sameLine, saveCart, storageKey, toPriced, type CategoryView, type ItemView,
} from './cart.ts'
import styles from './customer.module.css'

type Props = {
  slug: string
  contextKey: string
  checkoutHref: string
  categories: CategoryView[]
  lang: Lang
  discountPercent: number | null
}

const CART_ERROR_KEY: Record<CartError['code'], UiKey> = {
  unknown_item: 'checkout.itemUnavailable',
  unknown_variant: 'checkout.itemUnavailable',
  unknown_option: 'checkout.itemUnavailable',
  duplicate_option: 'checkout.itemUnavailable',
  invalid_qty: 'checkout.itemUnavailable',
  min_select: 'menu.required',
  max_select: 'menu.upTo',
  // Finding negative-unit-price-cart: the menu row is mispriced, so from the diner's side this
  // dish simply cannot be ordered — which is what `checkout.itemUnavailable` already says in all
  // three languages. The price is the restaurant's problem, not something to explain at the till.
  invalid_price: 'checkout.itemUnavailable',
}

const configurable = (item: ItemView) => item.variants.length > 0 || item.optionGroups.length > 0

/**
 * The menu with the cart (design §7.3, §7.4). The only interactive part of the page: category
 * jump links, a search box, ADD/stepper per row, an inline chooser for variants and options,
 * and the persistent cart bar. Cart state lives in localStorage; the server re-prices at checkout.
 */
export function MenuClient({ slug, contextKey, checkoutHref, categories, lang, discountPercent }: Props) {
  const key = storageKey(slug, contextKey)
  const priced = useMemo(() => toPriced(categories), [categories])
  const [lines, setLines] = useState<CartItemInput[]>([])
  const [query, setQuery] = useState('')
  const [active, setActive] = useState<string | null>(null)
  const [choosing, setChoosing] = useState<ItemView | null>(null)
  const [dropped, setDropped] = useState(false)

  // Read after mount: the server rendered an empty cart and hydration must match it.
  useEffect(() => {
    const loaded = loadCart(key)
    const kept = prune(loaded, priced)
    setLines(kept)
    // Finding unpriceable-cart-line-kills-cart: a dropped line is written back and said out loud.
    // Left in storage it came back every visit; left unsaid it looked like the cart had vanished.
    if (kept.length !== loaded.length) {
      saveCart(key, kept)
      setDropped(true)
    }
  }, [key, priced])

  function update(next: CartItemInput[]) {
    setLines(next)
    saveCart(key, next)
  }

  const qtyOf = (itemId: string) => lines.filter((l) => l.itemId === itemId).reduce((n, l) => n + l.qty, 0)

  /**
   * A plain item has one line. A configurable item's ADD opens the chooser; its stepper acts
   * on the most recently added line for that item. ponytail: one configuration at a time per
   * item through the row; the upgrade is a per-line list under the row.
   */
  function onQty(item: ItemView, qty: number) {
    const current = qtyOf(item.id)
    if (!configurable(item)) {
      const rest = lines.filter((l) => l.itemId !== item.id)
      update(qty > 0 ? [...rest, { itemId: item.id, optionIds: [], qty }] : rest)
      return
    }
    if (current === 0) {
      setChoosing(item)
      return
    }
    const last = [...lines].reverse().find((l) => l.itemId === item.id)
    if (!last) return
    const delta = qty - current
    changeLine(last, last.qty + delta)
  }

  function changeLine(line: CartItemInput, qty: number) {
    const rest = lines.filter((l) => !sameLine(l, line))
    update(qty > 0 ? [...rest, { ...line, qty }] : rest)
  }

  function addConfigured(line: CartItemInput) {
    const existing = lines.find((l) => sameLine(l, line))
    if (existing) changeLine(existing, existing.qty + line.qty)
    else update([...lines, line])
    setChoosing(null)
  }

  const cart = useMemo(() => {
    try {
      return priceCart(lines, priced, discountPercent === null ? undefined : { percent: discountPercent })
    } catch {
      return null
    }
  }, [lines, priced, discountPercent])
  const count = lines.reduce((n, l) => n + l.qty, 0)

  // The floor for unpriceable-cart-line-kills-cart: this page must never render rows with
  // quantities against them and no cart bar. If pricing still refuses the whole cart, the lines
  // it refuses go, so the diner has a working cart instead of a dead end with no way out.
  useEffect(() => {
    if (cart !== null || lines.length === 0) return
    const kept = prune(lines, priced)
    // Nothing to remove and still unpriceable would re-enter this effect for ever; leave the
    // cart bar hidden rather than lock the page up.
    if (kept.length === lines.length) return
    setLines(kept)
    saveCart(key, kept)
    setDropped(true)
  }, [cart, lines, priced, key])

  const needle = query.trim().toLowerCase()
  const shown = needle
    ? categories
        .map((c) => ({ ...c, items: c.items.filter((i) => i.name.toLowerCase().includes(needle)) }))
        .filter((c) => c.items.length > 0)
    : categories

  const detailFor = (item: ItemView) => {
    if (!configurable(item)) return null
    const mine = lines.filter((l) => l.itemId === item.id)
    if (mine.length === 0) return null
    return mine.map((l) => {
      const names = [
        item.variants.find((v) => v.id === l.variantId)?.name,
        ...l.optionIds.map((id) => item.optionGroups.flatMap((g) => g.options).find((o) => o.id === id)?.name),
      ].filter(Boolean)
      return `${names.join(' + ') || item.name} × ${l.qty}`
    }).join(' · ')
  }

  return (
    <div className={count > 0 ? cartReserveClass : undefined}>
      {dropped && <Band tone="attention">{t('checkout.itemUnavailable', lang)}</Band>}

      <div className={styles.toolbar}>
        <Field id="menu-search" label={t('menu.search', lang)}>
          {(input) => (
            <input
              {...input}
              className={fieldStyles.control}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoComplete="off"
            />
          )}
        </Field>
      </div>

      {!needle && (
        <nav className={styles.tabs} aria-label={t('menu.categories', lang)}>
          {categories.map((c) => (
            <a
              key={c.id}
              href={`#cat-${c.id}`}
              className={`${styles.tab}${active === c.id ? ` ${styles.tabActive}` : ''}`}
              aria-current={active === c.id ? 'true' : undefined}
              onClick={() => setActive(c.id)}
            >
              {c.name}
            </a>
          ))}
        </nav>
      )}

      {shown.length === 0 && <p className={styles.note}>{t('menu.noMatch', lang, { query: query.trim() })}</p>}

      {shown.map((c) => (
        <section key={c.id} id={`cat-${c.id}`} className={styles.section} aria-labelledby={`cat-${c.id}-h`}>
          <h2 id={`cat-${c.id}-h`} className={styles.sectionTitle}>{c.name}</h2>
          <ul className={styles.list}>
            {c.items.map((item) => (
              <MenuRow
                key={item.id}
                item={item}
                lang={lang}
                qty={qtyOf(item.id)}
                onQty={(q) => onQty(item, q)}
                detail={detailFor(item)}
                chooser={choosing?.id === item.id
                  ? <Chooser item={item} lang={lang} onAdd={addConfigured} onCancel={() => setChoosing(null)} />
                  : null}
              />
            ))}
          </ul>
        </section>
      ))}

      {cart && (
        <CartBar count={count} totalPaise={cart.totalPaise} href={checkoutHref} lang={lang} />
      )}
    </div>
  )
}

function MenuRow({ item, lang, qty, onQty, detail, chooser }: {
  item: ItemView
  lang: Lang
  qty: number
  onQty: (qty: number) => void
  detail: string | null
  chooser: ReactNode
}) {
  return (
    <>
      <MenuItemRow item={item} lang={lang} qty={qty} onQtyChange={onQty} detail={detail} />
      {chooser}
    </>
  )
}

/**
 * Variants (one of) and option groups (min/max) for one item, inline under its row. The
 * candidate line is validated by core's `priceCart` before it is added, so the same rule that
 * refuses it at checkout refuses it here — with the price it would cost shown live.
 */
function Chooser({ item, lang, onAdd, onCancel }: {
  item: ItemView
  lang: Lang
  onAdd: (line: CartItemInput) => void
  onCancel: () => void
}) {
  const [variantId, setVariantId] = useState<string | undefined>(item.variants[0]?.id)
  const [optionIds, setOptionIds] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  const line: CartItemInput = { itemId: item.id, variantId, optionIds, qty: 1 }
  let preview: string | null = null
  try {
    preview = formatINR(priceCart([line], [item]).totalPaise)
  } catch {
    preview = null
  }

  function toggle(group: ItemView['optionGroups'][number], optionId: string, on: boolean) {
    const ids = new Set(optionIds)
    if (group.maxSelect === 1) for (const o of group.options) ids.delete(o.id)
    if (on) ids.add(optionId)
    else ids.delete(optionId)
    setOptionIds([...ids])
    setError(null)
  }

  function add() {
    try {
      priceCart([line], [item])
      onAdd(line)
    } catch (e) {
      if (e instanceof CartError) {
        const group = item.optionGroups.find((g) => e.message.includes(g.name))
        setError(t(CART_ERROR_KEY[e.code], lang, { max: group?.maxSelect ?? '' }))
      }
    }
  }

  return (
    <li className={styles.chooser} lang={lang}>
      <p className={styles.chooserTitle}>{t('menu.choose', lang, { item: item.name })}</p>

      {item.variants.length > 0 && (
        <fieldset className={styles.group}>
          <legend className={styles.groupLegend}>{item.name}</legend>
          {item.variants.map((v) => (
            <label key={v.id} className={styles.choice}>
              <input type="radio" name={`variant-${item.id}`} checked={variantId === v.id} onChange={() => setVariantId(v.id)} />
              <span className={styles.choiceName}>{v.name}</span>
              <span className="num">{formatINR(paise(item.pricePaise + v.priceDeltaPaise))}</span>
            </label>
          ))}
        </fieldset>
      )}

      {item.optionGroups.map((g) => (
        <fieldset key={g.id} className={styles.group}>
          <legend className={styles.groupLegend}>
            {g.name}{' '}
            <span className={styles.groupHint}>
              {g.minSelect > 0 ? t('menu.required', lang) : g.maxSelect > 1 ? t('menu.upTo', lang, { max: g.maxSelect }) : ''}
            </span>
          </legend>
          {g.options.map((o) => (
            <label key={o.id} className={styles.choice}>
              <input
                type={g.maxSelect === 1 ? 'radio' : 'checkbox'}
                name={`group-${g.id}`}
                checked={optionIds.includes(o.id)}
                onChange={(e) => toggle(g, o.id, e.target.checked)}
              />
              <span className={styles.choiceName}>{o.name}</span>
              {o.priceDeltaPaise !== 0 && <span className="num">+{formatINR(paise(o.priceDeltaPaise))}</span>}
            </label>
          ))}
        </fieldset>
      ))}

      {error && <p className={styles.error} role="status">{error}</p>}

      <div className={styles.chooserActions}>
        <Button variant="ghost" onClick={onCancel}>{t('common.cancel', lang)}</Button>
        <Button variant="brand" onClick={add}>
          {t('menu.addToCart', lang)}{preview ? <> · <span className="num">{preview}</span></> : null}
        </Button>
      </div>
    </li>
  )
}
