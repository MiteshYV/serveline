'use client'

import { useEffect, useMemo, useState } from 'react'
import type { CodeOutcome, PageContext } from '@/checkout/place-order.ts'
import { priceCart, type CartItemInput } from '@/core/cart.ts'
import { formatINR } from '@/core/money.ts'
import { Band } from '@/ui/Band.tsx'
import { Button } from '@/ui/Button.tsx'
import { t, type Lang, type UiKey } from '@/ui/i18n.ts'
import { QtyStepper } from '@/ui/QtyStepper.tsx'
import { loadCart, prune, saveCart, storageKey, toPriced, type CategoryView } from '../cart.ts'
import { codeMessage } from '../code-message.ts'
import { placeOrderAction, type PlaceOrderActionResult } from './actions.ts'
import styles from '../customer.module.css'

type Method = 'upi_link' | 'cod' | 'pay_at_table'

type Props = {
  slug: string
  qs: string
  contextKey: string
  lang: Lang
  ctx: PageContext
  categories: CategoryView[]
  code: CodeOutcome | null
  address: { line1: string; landmark: string | null; area: string | null; pincode: string | null; id: string } | null
  codEnabled: boolean
  menuHref: string
  changeAddressHref: string
}

const FAILURE_KEY: Record<Exclude<PlaceOrderActionResult, { ok: true }>['reason'], UiKey> = {
  empty_cart: 'cart.empty',
  menu_unavailable: 'menu.closed',
  bad_payment_method: 'checkout.failed',
  cod_disabled: 'checkout.failed',
  address_required: 'checkout.failed',
  code_refused: 'checkout.failed',
  not_signed_in: 'checkout.failed',
  bad_request: 'checkout.failed',
  unknown_item: 'checkout.itemUnavailable',
  unknown_variant: 'checkout.itemUnavailable',
  unknown_option: 'checkout.itemUnavailable',
  duplicate_option: 'checkout.itemUnavailable',
  invalid_qty: 'checkout.itemUnavailable',
  min_select: 'checkout.itemUnavailable',
  max_select: 'checkout.itemUnavailable',
}

/**
 * The confirm step (design §7.4, step 3): the lines, the total, where it goes, how it is paid,
 * and the one terminal action — "Send to kitchen" at a table, "Place order" for delivery. Prices
 * shown here come from the same `priceCart` the server runs again before anything is written.
 */
export function ConfirmStep({ slug, qs, contextKey, lang, ctx, categories, code: initialCode, address, codEnabled, menuHref, changeAddressHref }: Props) {
  const key = storageKey(slug, contextKey)
  const priced = useMemo(() => toPriced(categories), [categories])
  const [lines, setLines] = useState<CartItemInput[] | null>(null)
  const [code, setCode] = useState(initialCode)
  const [method, setMethod] = useState<Method>(ctx.kind === 'table' ? 'pay_at_table' : 'upi_link')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLines(prune(loadCart(key), priced))
  }, [key, priced])

  const cart = useMemo(() => {
    if (!lines) return null
    try {
      return priceCart(lines, priced, code?.ok ? { percent: code.percent } : undefined)
    } catch {
      return null
    }
  }, [lines, priced, code])

  function setQty(index: number, qty: number) {
    if (!lines) return
    const next = lines.flatMap((l, i) => (i !== index ? [l] : qty > 0 ? [{ ...l, qty }] : []))
    setLines(next)
    saveCart(key, next)
  }

  async function submit() {
    if (!lines || lines.length === 0 || busy) return
    setBusy(true)
    setError(null)
    let result: PlaceOrderActionResult
    try {
      result = await placeOrderAction({
        slug, qs, items: lines, paymentMethod: method, ...(address ? { addressId: address.id } : {}),
      })
    } catch {
      setBusy(false)
      setError(t('checkout.failed', lang))
      return
    }
    if (result.ok) {
      saveCart(key, [])
      window.location.assign(result.paymentUrl ?? result.statusUrl)
      return
    }
    setBusy(false)
    if (result.reason === 'code_refused' && result.code) {
      // Build Spec §6: shown without the discount, and told why. The total above re-renders.
      setCode(result.code)
      setError(codeMessage(result.code, lang))
      return
    }
    setError(t(FAILURE_KEY[result.reason], lang))
  }

  if (lines === null) return <p className={styles.note}>{t('action.saving', lang)}</p>

  if (!cart || lines.length === 0) {
    return (
      <div className={styles.form}>
        <p className={styles.note}>{t('cart.empty', lang)}</p>
        <Button href={menuHref} variant="brand" block>{t('checkout.backToMenu', lang)}</Button>
      </div>
    )
  }

  const nameOf = (line: CartItemInput) => priced.find((i) => i.id === line.itemId)

  return (
    <div className={styles.form}>
      <section className={styles.card} aria-labelledby="items-h">
        <h3 id="items-h" className={styles.subhead}>{t('checkout.items', lang)}</h3>
        <ul className={styles.lines}>
          {cart.lines.map((line, i) => {
            const src = lines[i]
            const item = src ? nameOf(src) : undefined
            return (
              <li key={line.id} className={styles.line}>
                <span className={styles.lineName}>
                  {line.itemName}
                  {(line.variantName || line.optionNames.length > 0) && (
                    <span className={styles.lineSub}>{[line.variantName, ...line.optionNames].filter(Boolean).join(' + ')}</span>
                  )}
                </span>
                <QtyStepper qty={line.qty} onChange={(q) => setQty(i, q)} itemName={item?.name ?? line.itemName} lang={lang} />
                <span className={`${styles.lineAmount} num`}>{formatINR(line.linePaise)}</span>
              </li>
            )
          })}
        </ul>
        <div className={styles.totals}>
          {cart.discountPaise > 0 && (
            <>
              <div className={styles.totalRow}><span>{t('cart.subtotal', lang)}</span><span className="num">{formatINR(cart.subtotalPaise)}</span></div>
              <div className={styles.totalRow}><span>{t('cart.discount', lang)}</span><span className="num">−{formatINR(cart.discountPaise)}</span></div>
            </>
          )}
          <div className={styles.totalRow}><strong>{t('cart.total', lang)}</strong><strong className="num">{formatINR(cart.totalPaise)}</strong></div>
        </div>
        <a href={menuHref} className={styles.inlineLink}>{t('checkout.backToMenu', lang)}</a>
      </section>

      {code && <Band tone="neutral" live="off">{codeMessage(code, lang)}</Band>}

      {ctx.kind === 'table' ? (
        <p className={styles.note}>{t('checkout.tableInfo', lang, { n: ctx.tableNo })}</p>
      ) : (
        address && (
          <section className={styles.card}>
            <div className={styles.kv}>
              <span className={styles.kvLabel}>{t('checkout.deliverTo', lang)}</span>
              <span>{address.line1}{address.landmark ? `, ${address.landmark}` : ''}</span>
              <span className={styles.optionMeta}>{[address.area, address.pincode].filter(Boolean).join(' ')}</span>
              <a href={changeAddressHref} className={styles.inlineLink}>{t('checkout.change', lang)}</a>
            </div>
          </section>
        )
      )}

      {ctx.kind === 'delivery' && (
        <fieldset className={styles.group}>
          <legend className={styles.subhead}>{t('checkout.paymentMethod', lang)}</legend>
          <div className={styles.form}>
            <label className={`${styles.option}${method === 'upi_link' ? ` ${styles.optionSelected}` : ''}`}>
              <input type="radio" name="method" checked={method === 'upi_link'} onChange={() => setMethod('upi_link')} />
              <span className={styles.optionBody}>{t('checkout.payUpi', lang)}</span>
            </label>
            {codEnabled && (
              <label className={`${styles.option}${method === 'cod' ? ` ${styles.optionSelected}` : ''}`}>
                <input type="radio" name="method" checked={method === 'cod'} onChange={() => setMethod('cod')} />
                <span className={styles.optionBody}>{t('checkout.payCod', lang)}</span>
              </label>
            )}
          </div>
        </fieldset>
      )}

      {error && <Band tone="attention">{error}</Band>}

      <Button variant="brand" size="counter" block onClick={submit} disabled={busy}>
        {busy
          ? t('checkout.placing', lang)
          : ctx.kind === 'table'
            ? t('cart.sendToKitchen', lang)
            : t('checkout.placeOrder', lang)}
        {!busy && <> · <span className="num">{formatINR(cart.totalPaise)}</span></>}
      </Button>
    </div>
  )
}
