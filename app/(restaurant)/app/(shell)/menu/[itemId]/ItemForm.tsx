'use client'

import { useActionState } from 'react'
import { Band } from '@/ui/Band.tsx'
import { Button } from '@/ui/Button.tsx'
import { Field } from '@/ui/Field.tsx'
import fieldStyles from '@/ui/Field.module.css'
import { saveItem, type ItemFormState } from '../actions.ts'
import styles from '../Menu.module.css'

export type ItemFormData = {
  id?: string
  categoryId: string
  name: string
  description: string
  /** Rupees as text, for the field. */
  price: string
  isVeg: boolean
  spiceLevel: 'none' | 'mild' | 'medium' | 'hot'
  isAvailable: boolean
  variants: { id: string; name: string; delta: string }[]
  optionGroups: { id: string; name: string; min: number; max: number; options: { id: string; name: string; delta: string }[] }[]
}

type Props = { item: ItemFormData; categories: { id: string; name: string }[] }

const BLANK_VARIANTS = 2
const BLANK_GROUPS = 1
const BLANK_OPTIONS = 2
const MAX_VARIANTS = 6
const MAX_GROUPS = 3
const MAX_OPTIONS = 6

const pad = <T,>(rows: T[], blank: T, extra: number, max: number): T[] => {
  const out = [...rows]
  while (out.length < Math.min(max, rows.length + extra)) out.push(blank)
  return out
}

/**
 * The item editor (Build Spec §7). No JavaScript "add row": a fixed grid of rows with a couple
 * of blanks after the existing ones, and an emptied name removes the row. It is enough for a
 * tiffin menu, it works with a cracked screen, and the repository diffs by id either way.
 */
export function ItemForm({ item, categories }: Props) {
  const [state, act, pending] = useActionState(saveItem, {} as ItemFormState)
  const err = (k: string) => state.fieldErrors?.[k]
  const variants = pad(item.variants, { id: '', name: '', delta: '' }, BLANK_VARIANTS, MAX_VARIANTS)
  const groups = pad(item.optionGroups, { id: '', name: '', min: 0, max: 1, options: [] }, BLANK_GROUPS, MAX_GROUPS)

  return (
    <form action={act} className={styles.form}>
      {state.error && <Band tone="attention">{state.error}</Band>}
      {item.id && <input type="hidden" name="id" value={item.id} />}

      <Field id="name" label="Name">
        {(p) => <input {...p} name="name" className={fieldStyles.control} type="text" defaultValue={item.name} required maxLength={120} />}
      </Field>
      <Field id="description" label="Description" hint="Optional. Two lines at most on the phone.">
        {(p) => <input {...p} name="description" className={fieldStyles.control} type="text" defaultValue={item.description} maxLength={500} />}
      </Field>
      <div className={styles.grid2}>
        <Field id="price" label="Price (₹)" error={err('price')}>
          {(p) => <input {...p} name="price" className={`${fieldStyles.control} num`} type="text" inputMode="decimal" defaultValue={item.price} required />}
        </Field>
        <Field id="categoryId" label="Category">
          {(p) => (
            <select {...p} name="categoryId" className={fieldStyles.control} defaultValue={item.categoryId}>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
        </Field>
      </div>
      <div className={styles.grid2}>
        <Field id="spiceLevel" label="Spice">
          {(p) => (
            <select {...p} name="spiceLevel" className={fieldStyles.control} defaultValue={item.spiceLevel}>
              <option value="none">None</option>
              <option value="mild">Mild</option>
              <option value="medium">Medium</option>
              <option value="hot">Hot</option>
            </select>
          )}
        </Field>
        <div className="grid gap-[var(--space-4)]">
          <label className={styles.check}><input type="checkbox" name="isVeg" defaultChecked={item.isVeg} /> Vegetarian</label>
          <label className={styles.check}><input type="checkbox" name="isAvailable" defaultChecked={item.isAvailable} /> Available</label>
        </div>
      </div>

      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>Variants — half and full, sizes. The price above is the base; a variant adds or subtracts.</legend>
        {variants.map((v, i) => (
          <div key={i} className={styles.grid2}>
            <input type="hidden" name={`variant[${i}].id`} value={v.id} />
            <Field id={`variant-${i}-name`} label={`Variant ${i + 1}`}>
              {(p) => <input {...p} name={`variant[${i}].name`} className={fieldStyles.control} type="text" defaultValue={v.name} maxLength={60} />}
            </Field>
            <Field id={`variant-${i}-delta`} label="± ₹" error={err(`variant[${i}].delta`)}>
              {(p) => <input {...p} name={`variant[${i}].delta`} className={`${fieldStyles.control} num`} type="text" inputMode="decimal" defaultValue={v.delta} />}
            </Field>
          </div>
        ))}
      </fieldset>

      {groups.map((g, gi) => (
        <fieldset key={gi} className={styles.fieldset}>
          <legend className={styles.legend}>Option group {gi + 1} — extras or a required choice</legend>
          <input type="hidden" name={`group[${gi}].id`} value={g.id} />
          <div className={styles.grid3}>
            <Field id={`group-${gi}-name`} label="Group name" error={err(`group[${gi}].name`)}>
              {(p) => <input {...p} name={`group[${gi}].name`} className={fieldStyles.control} type="text" defaultValue={g.name} maxLength={60} />}
            </Field>
            <Field id={`group-${gi}-min`} label="Min" error={err(`group[${gi}].min`)}>
              {(p) => <input {...p} name={`group[${gi}].min`} className={`${fieldStyles.control} num`} type="text" inputMode="numeric" defaultValue={String(g.min)} />}
            </Field>
            <Field id={`group-${gi}-max`} label="Max">
              {(p) => <input {...p} name={`group[${gi}].max`} className={`${fieldStyles.control} num`} type="text" inputMode="numeric" defaultValue={String(g.max)} />}
            </Field>
          </div>
          {pad(g.options, { id: '', name: '', delta: '' }, BLANK_OPTIONS, MAX_OPTIONS).map((o, oi) => (
            <div key={oi} className={styles.grid2}>
              <input type="hidden" name={`group[${gi}].option[${oi}].id`} value={o.id} />
              <Field id={`group-${gi}-option-${oi}-name`} label={`Option ${oi + 1}`}>
                {(p) => <input {...p} name={`group[${gi}].option[${oi}].name`} className={fieldStyles.control} type="text" defaultValue={o.name} maxLength={60} />}
              </Field>
              <Field id={`group-${gi}-option-${oi}-delta`} label="+ ₹" error={err(`group[${gi}].option[${oi}].delta`)}>
                {(p) => <input {...p} name={`group[${gi}].option[${oi}].delta`} className={`${fieldStyles.control} num`} type="text" inputMode="decimal" defaultValue={o.delta} />}
              </Field>
            </div>
          ))}
        </fieldset>
      ))}

      <div className="flex gap-[var(--space-16)]">
        <Button size="counter" type="submit" aria-disabled={pending || undefined}>{pending ? 'Saving…' : 'Save item'}</Button>
        <Button size="counter" variant="ghost" href="/app/menu">Back</Button>
      </div>
    </form>
  )
}
