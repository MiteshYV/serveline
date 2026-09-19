'use client'

import { Fragment, startTransition, useId, useMemo, useState } from 'react'
import { CartError, priceCart, type CartItemInput, type PricedMenuItem } from '@/core/cart.ts'
import { formatINR, paise } from '@/core/money.ts'
import { Band } from '@/ui/Band.tsx'
import { Button } from '@/ui/Button.tsx'
import { CartBar, cartReserveClass } from '@/ui/CartBar.tsx'
import { Field } from '@/ui/Field.tsx'
import fieldStyles from '@/ui/Field.module.css'
import { td, type DashKey } from '@/ui/i18n-dashboard.ts'
import { t, type Lang } from '@/ui/i18n.ts'
import { MenuItemRow, type MenuItemView } from '@/ui/MenuItemRow.tsx'
import { PhoneInput } from '@/ui/PhoneInput.tsx'
import { QtyStepper } from '@/ui/QtyStepper.tsx'
import { lookupCustomer, placeManualOrder, type Lookup, type ManualOrderInput, type PlaceResult } from './actions.ts'
import styles from './ManualOrder.module.css'

export type Category = { id: string; name: string; items: MenuItemView[] }

type Props = {
  lang: Lang
  categories: Category[]
  /** What `priceCart` reads — the same shape the ordering page and the M2 voice tools use. */
  priced: PricedMenuItem[]
  codEnabled: boolean
}

type Line = { key: number; input: CartItemInput }
type Fulfilment = ManualOrderInput['fulfilment']

const ERROR_KEY: Record<PlaceResult['error'], DashKey> = {
  invalid: 'manual.failed',
  phone: 'manual.failed',
  table: 'manual.failed',
  cart: 'manual.failed',
  pincode: 'manual.notServed',
  upi_needs_phone: 'manual.upiNeedsPhone',
  no_menu: 'manual.failed',
  failed: 'manual.failed',
}

/**
 * Manual entry (Build Spec §7) with the ordering page's own rows, stepper and cart bar. An item
 * with variants or options opens an inline chooser under its row; each distinct choice is its
 * own line, listed with a stepper in the Order section. Pricing is core's `priceCart`, here for
 * the running total and again on the server for the order.
 */
export function ManualOrder({ lang, categories, priced, codEnabled }: Props) {
  const pricedById = useMemo(() => new Map(priced.map((p) => [p.id, p])), [priced])
  const [lines, setLines] = useState<Line[]>([])
  const [nextKey, setNextKey] = useState(1)
  const [chooser, setChooser] = useState<{ itemId: string; variantId?: string; optionIds: string[]; error?: string } | null>(null)

  const [fulfilment, setFulfilment] = useState<Fulfilment>('dine_in')
  const [tableNo, setTableNo] = useState('')
  const [phone, setPhone] = useState('')
  const [lookup, setLookup] = useState<Lookup | null>(null)
  const [addressId, setAddressId] = useState<string>('')
  const [line1, setLine1] = useState('')
  const [landmark, setLandmark] = useState('')
  const [pincode, setPincode] = useState('')
  const [notes, setNotes] = useState('')
  const [payment, setPayment] = useState<'cod' | 'upi_link'>(codEnabled ? 'cod' : 'upi_link')
  const [placing, setPlacing] = useState(false)
  const [error, setError] = useState<DashKey | null>(null)
  const ids = { table: useId(), notes: useId(), line1: useId(), landmark: useId(), pincode: useId(), phone: useId() }

  const cart = useMemo(() => {
    try {
      return priceCart(lines.map((l) => l.input), priced)
    } catch (e) {
      if (e instanceof CartError) return null
      throw e
    }
  }, [lines, priced])
  const count = lines.reduce((n, l) => n + l.input.qty, 0)

  const qtyOf = (itemId: string) => lines.filter((l) => l.input.itemId === itemId).reduce((n, l) => n + l.input.qty, 0)
  const setLineQty = (key: number, qty: number) =>
    setLines((ls) => (qty <= 0 ? ls.filter((l) => l.key !== key) : ls.map((l) => (l.key === key ? { ...l, input: { ...l.input, qty } } : l))))
  const addLine = (input: CartItemInput) => {
    // The same choice again is one line with a bigger quantity, as a diner would expect.
    const same = lines.find((l) => l.input.itemId === input.itemId && l.input.variantId === input.variantId && l.input.optionIds.join() === input.optionIds.join())
    if (same) setLineQty(same.key, same.input.qty + input.qty)
    else {
      setLines((ls) => [...ls, { key: nextKey, input }])
      setNextKey((k) => k + 1)
    }
  }

  const onRowQty = (item: MenuItemView) => (qty: number) => {
    const p = pricedById.get(item.id)
    if (!p) return
    const hasChoices = p.variants.length > 0 || p.optionGroups.length > 0
    const current = qtyOf(item.id)
    if (!hasChoices) {
      const single = lines.find((l) => l.input.itemId === item.id)
      if (single) setLineQty(single.key, qty)
      else if (qty > 0) addLine({ itemId: item.id, optionIds: [], qty })
      return
    }
    if (qty > current) setChooser({ itemId: item.id, ...(p.variants[0] ? { variantId: p.variants[0].id } : {}), optionIds: [] })
    else {
      const last = [...lines].reverse().find((l) => l.input.itemId === item.id)
      if (last) setLineQty(last.key, last.input.qty - 1)
    }
  }

  const confirmChooser = () => {
    if (!chooser) return
    const input: CartItemInput = { itemId: chooser.itemId, ...(chooser.variantId ? { variantId: chooser.variantId } : {}), optionIds: chooser.optionIds, qty: 1 }
    try {
      priceCart([input], priced)
    } catch (e) {
      if (e instanceof CartError) {
        setChooser({ ...chooser, error: e.code === 'min_select' ? td('manual.required', lang) : t('action.retry', lang) })
        return
      }
      throw e
    }
    addLine(input)
    setChooser(null)
  }

  const lineLabel = (input: CartItemInput) => {
    const p = pricedById.get(input.itemId)
    if (!p) return '?'
    const v = p.variants.find((x) => x.id === input.variantId)?.name
    const os = p.optionGroups.flatMap((g) => g.options).filter((o) => input.optionIds.includes(o.id)).map((o) => o.name)
    return `${p.name}${v ? ` — ${v}` : ''}${os.length ? ` + ${os.join(', ')}` : ''}`
  }

  const doLookup = () => startTransition(async () => setLookup(await lookupCustomer(phone)))

  const place = () => {
    setError(null)
    setPlacing(true)
    startTransition(async () => {
      const payload: ManualOrderInput = {
        fulfilment,
        ...(fulfilment === 'dine_in' ? { tableNo } : {}),
        ...(phone ? { phone } : {}),
        ...(notes ? { notes } : {}),
        paymentMethod: fulfilment === 'dine_in' ? 'pay_at_table' : payment,
        lines: lines.map((l) => l.input),
        ...(fulfilment === 'delivery' && addressId ? { addressId } : {}),
        ...(fulfilment === 'delivery' && !addressId && line1 ? { newAddress: { line1, ...(landmark ? { landmark } : {}), pincode } } : {}),
      }
      const res = await placeManualOrder(payload)
      // A success redirects and never returns.
      setPlacing(false)
      setError(ERROR_KEY[res.error])
    })
  }

  const consented = lookup?.ok === true && lookup.consented
  const chooserItem = chooser ? pricedById.get(chooser.itemId) : undefined

  return (
    <div className={`${styles.page} ${count > 0 ? cartReserveClass : ''}`}>
      <h1 className={styles.title}>{td('manual.title', lang)}</h1>

      {categories.map((c) => (
        <div key={c.id}>
          <h2 className={styles.category}>{c.name}</h2>
          <ul className={styles.menu}>
            {c.items.map((item) => (
              <Fragment key={item.id}>
                <MenuItemRow item={item} lang={lang} qty={qtyOf(item.id)} onQtyChange={onRowQty(item)} />
                {chooser?.itemId === item.id && chooserItem && (
                  <li className={styles.chooser}>
                    {chooserItem.variants.length > 0 && (
                      <div>
                        <p className={styles.groupName}>{td('manual.choose', lang)}</p>
                        <div className={styles.choices}>
                          {chooserItem.variants.map((v) => (
                            <label key={v.id} className={styles.choice}>
                              <input type="radio" name={`variant-${item.id}`} checked={chooser.variantId === v.id} onChange={() => setChooser({ ...chooser, variantId: v.id })} />
                              {v.name}{v.priceDeltaPaise !== 0 && <span className="num">{v.priceDeltaPaise > 0 ? '+' : '−'}{formatINR(paise(Math.abs(v.priceDeltaPaise)))}</span>}
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                    {chooserItem.optionGroups.map((g) => {
                      const single = g.maxSelect <= 1
                      return (
                        <div key={g.id}>
                          <p className={styles.groupName}>
                            {g.name}{' '}
                            <span className={styles.groupHint}>{g.minSelect > 0 ? `· ${td('manual.required', lang)}` : `· ${td('manual.upTo', lang, { n: g.maxSelect })}`}</span>
                          </p>
                          <div className={styles.choices}>
                            {g.options.map((o) => {
                              const on = chooser.optionIds.includes(o.id)
                              const others = chooser.optionIds.filter((id) => !g.options.some((x) => x.id === id))
                              const toggle = () => {
                                const inGroup = chooser.optionIds.filter((id) => g.options.some((x) => x.id === id))
                                let next: string[]
                                if (single) next = on ? [] : [o.id]
                                else if (on) next = inGroup.filter((id) => id !== o.id)
                                else if (inGroup.length >= g.maxSelect) return
                                else next = [...inGroup, o.id]
                                setChooser({ ...chooser, optionIds: [...others, ...next] })
                              }
                              return (
                                <label key={o.id} className={styles.choice}>
                                  <input type={single ? 'radio' : 'checkbox'} name={`group-${g.id}`} checked={on} onChange={toggle} />
                                  {o.name}{o.priceDeltaPaise !== 0 && <span className="num">+{formatINR(paise(o.priceDeltaPaise))}</span>}
                                </label>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                    {chooser.error && <p className={styles.error}>{chooser.error}</p>}
                    <div className="flex gap-[var(--space-16)]">
                      <Button size="counter" onClick={confirmChooser}>{td('manual.addToOrder', lang)}</Button>
                      <Button size="counter" variant="ghost" onClick={() => setChooser(null)}>{t('common.cancel', lang)}</Button>
                    </div>
                  </li>
                )}
              </Fragment>
            ))}
          </ul>
        </div>
      ))}

      <section id="order" className={styles.section} aria-labelledby="order-title">
        <h2 id="order-title" className={styles.sectionTitle}>{td('manual.order', lang)}</h2>
        {lines.length === 0 ? (
          <p className={styles.hint}>{t('cart.empty', lang)}</p>
        ) : (
          <ul className={styles.lines}>
            {lines.map((l) => {
              const priced = cart?.lines.find((cl) => cl.id === `line-${lines.indexOf(l) + 1}`)
              return (
                <li key={l.key} className={styles.line}>
                  <span className={styles.lineName}>{lineLabel(l.input)}</span>
                  {priced && <span className={`${styles.linePrice} num`}>{formatINR(priced.linePaise)}</span>}
                  <QtyStepper qty={l.input.qty} onChange={(q) => setLineQty(l.key, q)} itemName={lineLabel(l.input)} lang={lang} size="counter" />
                </li>
              )
            })}
          </ul>
        )}
        {cart && lines.length > 0 && (
          <div className={styles.totals}>
            <div className={styles.total}><span>{t('cart.total', lang)}</span><span className="num">{formatINR(cart.totalPaise)}</span></div>
          </div>
        )}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{td('manual.fulfilment', lang)}</h2>
        <div className={styles.choices} role="radiogroup" aria-label={td('manual.fulfilment', lang)}>
          {(['dine_in', 'pickup', 'delivery'] as const).map((f) => (
            <label key={f} className={styles.choice}>
              <input type="radio" name="fulfilment" checked={fulfilment === f} onChange={() => setFulfilment(f)} />
              {td(f === 'dine_in' ? 'manual.dineIn' : f === 'pickup' ? 'manual.pickup' : 'manual.delivery', lang)}
            </label>
          ))}
        </div>
        {fulfilment === 'dine_in' && (
          <Field id={ids.table} label={td('manual.table', lang)}>
            {(p) => <input {...p} className={`${fieldStyles.control} num`} type="text" inputMode="numeric" value={tableNo} onChange={(e) => setTableNo(e.target.value)} required />}
          </Field>
        )}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{td('detail.customer', lang)}</h2>
        <div className={styles.row}>
          {/* PhoneInput is uncontrolled and server-safe; its input events bubble to this wrapper. */}
          <div onInput={(e) => setPhone((e.target as HTMLInputElement).value)} onBlur={() => phone && doLookup()}>
            <PhoneInput lang={lang} id={ids.phone} label={td('manual.phone', lang)} required={false} />
          </div>
          <Button size="counter" variant="ghost" onClick={doLookup}>{td('manual.lookup', lang)}</Button>
        </div>
        {lookup?.ok === true && lookup.found && (
          consented
            ? <p className={styles.hint}>{td('manual.profile', lang)}{lookup.name ? ` · ${lookup.name}` : ''}</p>
            : <p className={styles.hint}>{td('manual.noConsent', lang)}</p>
        )}
        {fulfilment === 'delivery' && (
          consented && lookup?.ok ? (
            <div className={styles.section}>
              {lookup.addresses.length > 0 && (
                <div className={styles.choices} role="radiogroup" aria-label={td('manual.savedAddress', lang)}>
                  {lookup.addresses.map((a) => (
                    <label key={a.id} className={styles.choice}>
                      <input type="radio" name="address" checked={addressId === a.id} onChange={() => setAddressId(a.id)} />
                      {[a.label, a.line1, a.area ?? a.pincode].filter(Boolean).join(' · ')}
                    </label>
                  ))}
                  <label className={styles.choice}>
                    <input type="radio" name="address" checked={addressId === ''} onChange={() => setAddressId('')} />
                    {td('manual.newAddress', lang)}
                  </label>
                </div>
              )}
              {addressId === '' && (
                <>
                  <Field id={ids.line1} label={td('manual.line1', lang)}>
                    {(p) => <input {...p} className={fieldStyles.control} type="text" value={line1} onChange={(e) => setLine1(e.target.value)} />}
                  </Field>
                  <Field id={ids.landmark} label={td('manual.landmark', lang)}>
                    {(p) => <input {...p} className={fieldStyles.control} type="text" value={landmark} onChange={(e) => setLandmark(e.target.value)} />}
                  </Field>
                  <Field id={ids.pincode} label={td('manual.pincode', lang)} error={error === 'manual.notServed' ? td('manual.notServed', lang) : undefined}>
                    {(p) => <input {...p} className={`${fieldStyles.control} num`} type="text" inputMode="numeric" maxLength={6} value={pincode} onChange={(e) => setPincode(e.target.value.replace(/\D/g, ''))} />}
                  </Field>
                </>
              )}
            </div>
          ) : (
            <p className={styles.hint}>{td('manual.addressPending', lang)}</p>
          )
        )}
      </section>

      <section className={styles.section}>
        <Field id={ids.notes} label={td('manual.notes', lang)}>
          {(p) => <textarea {...p} className={`${fieldStyles.control} ${styles.textarea}`} value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />}
        </Field>
      </section>

      {fulfilment !== 'dine_in' && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{td('manual.payment', lang)}</h2>
          <div className={styles.choices} role="radiogroup" aria-label={td('manual.payment', lang)}>
            {codEnabled && (
              <label className={styles.choice}>
                <input type="radio" name="payment" checked={payment === 'cod'} onChange={() => setPayment('cod')} />
                {t('checkout.payCod', lang)}
              </label>
            )}
            <label className={styles.choice}>
              <input type="radio" name="payment" checked={payment === 'upi_link'} onChange={() => setPayment('upi_link')} />
              {td('manual.sendUpi', lang)}
            </label>
          </div>
          {payment === 'upi_link' && !phone && <p className={styles.hint}>{td('manual.upiNeedsPhone', lang)}</p>}
        </section>
      )}

      {error && error !== 'manual.notServed' && <Band tone="attention">{td(error, lang)}</Band>}

      <Button size="counter" block onClick={place} aria-disabled={placing || lines.length === 0 || !cart || undefined}>
        {placing ? td('manual.placing', lang) : td('manual.place', lang)}
      </Button>

      <CartBar count={count} totalPaise={cart?.totalPaise ?? 0} href="#order" lang={lang} label={td('manual.viewOrder', lang)} />
    </div>
  )
}
