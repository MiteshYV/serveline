'use client'

import type { PublishedItem } from '@/db/repos/menu.ts'
import { Band } from '@/ui/Band.tsx'
import { Button } from '@/ui/Button.tsx'
import { Field } from '@/ui/Field.tsx'
import { SPICE_LEVELS, paiseToInput } from '@/ui/itemForm.ts'
import { Panel } from '../../../../../bits.tsx'
import c from '../../../../../console.module.css'
import { useFormAction } from '../../../../../useFormAction.ts'
import { saveItem, type ItemFormState } from './actions.ts'

type Props = {
  restaurantId: string
  outletId: string
  categories: { id: string; name: string }[]
  item: PublishedItem | null
  defaultCategoryId: string
  backHref: string
}

/** Blank rows offered beyond the existing ones — see the ponytail note in src/ui/itemForm.ts. */
const BLANK_VARIANTS = 2
const BLANK_OPTIONS = 2

type Child = { id: string; name: string; priceDeltaPaise: number } | null
const pad = <T,>(rows: T[], blanks: number): (T | null)[] => [...rows, ...Array.from({ length: blanks }, () => null)]

/**
 * Build Spec §7: "item add and edit with variants and options" — the Lightspeed hierarchy the
 * design (§2) calls the right shape: item → variant → option group → option. Field names are
 * the contract in src/ui/itemForm.ts; errors come back keyed by them.
 */
export function ItemForm({ restaurantId, outletId, categories, item, defaultCategoryId, backHref }: Props) {
  const { state, pending, onSubmit } = useFormAction<ItemFormState>(saveItem, {})
  const err = (k: string) => state.errors?.[k]

  const ChildRows = ({ prefix, rows, label }: { prefix: string; rows: Child[]; label: string }) => (
    <table className={c.table}>
      <thead>
        <tr><th>{label}</th><th className={c.fieldMed}>Price delta (₹)</th><th className={c.fieldShort}></th></tr>
      </thead>
      <tbody>
        {rows.map((row, i) => {
          const n = `${prefix}[${i}]`
          return (
            <tr key={row?.id ?? `${n}-new`}>
              <td>
                <input type="hidden" name={`${n}.id`} value={row?.id ?? ''} />
                <input aria-label={`${label} ${i + 1} name`} name={`${n}.name`} defaultValue={row?.name} className={c.input} aria-invalid={err(`${n}.name`) ? true : undefined} placeholder={row ? undefined : 'Add…'} />
                {err(`${n}.name`) && <p className={c.fieldError}>{err(`${n}.name`)}</p>}
              </td>
              <td>
                <input aria-label={`${label} ${i + 1} price delta`} name={`${n}.priceDeltaPaise`} defaultValue={row ? paiseToInput(row.priceDeltaPaise) : ''} className={`${c.input} num`} inputMode="decimal" aria-invalid={err(`${n}.priceDeltaPaise`) ? true : undefined} />
                {err(`${n}.priceDeltaPaise`) && <p className={c.fieldError}>{err(`${n}.priceDeltaPaise`)}</p>}
              </td>
              <td>
                {row && (
                  <label className={c.check}>
                    <input type="checkbox" name={`${n}.remove`} /> Remove
                  </label>
                )}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )

  const groups = pad(item?.optionGroups ?? [], 1)

  return (
    <form onSubmit={onSubmit} className="grid gap-[var(--space-24)] max-w-[960px]">
      <input type="hidden" name="restaurantId" value={restaurantId} />
      <input type="hidden" name="outletId" value={outletId} />
      {item && <input type="hidden" name="id" value={item.id} />}
      {state.error && <Band tone="attention">{state.error}</Band>}

      <Panel title="Item">
        <div className={c.formGrid}>
          <Field id="name" label="Name" error={err('name')}>
            {(p) => <input {...p} name="name" defaultValue={item?.name} className={c.input} required maxLength={120} autoFocus={!item} />}
          </Field>
          <Field id="categoryId" label="Category" error={err('categoryId')}>
            {(p) => (
              <select {...p} name="categoryId" defaultValue={item?.categoryId ?? defaultCategoryId} className={c.select}>
                {categories.map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
              </select>
            )}
          </Field>
          <Field id="pricePaise" label="Price (₹)" hint="Base price; a variant's delta adjusts it." error={err('pricePaise')}>
            {(p) => <input {...p} name="pricePaise" defaultValue={item ? paiseToInput(item.pricePaise) : ''} className={`${c.input} num`} inputMode="decimal" required />}
          </Field>
          <Field id="spiceLevel" label="Spice" error={err('spiceLevel')}>
            {(p) => (
              <select {...p} name="spiceLevel" defaultValue={item?.spiceLevel ?? 'none'} className={c.select}>
                {SPICE_LEVELS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            )}
          </Field>
          <Field id="sort" label="Sort order" error={err('sort')}>
            {(p) => <input {...p} name="sort" defaultValue={item?.sort ?? 0} className={`${c.input} num`} inputMode="numeric" />}
          </Field>
          <Field id="allergens" label="Allergens" hint="Comma-separated: dairy, nuts, gluten" error={err('allergens')}>
            {(p) => <input {...p} name="allergens" defaultValue={item?.allergens.join(', ')} className={c.input} />}
          </Field>
          <Field id="tags" label="Tags" hint="Comma-separated: breakfast, chef's special" error={err('tags')}>
            {(p) => <input {...p} name="tags" defaultValue={item?.tags.join(', ')} className={c.input} />}
          </Field>
        </div>
        <Field id="description" label="Description" error={err('description')}>
          {(p) => <textarea {...p} name="description" defaultValue={item?.description ?? ''} className={c.textarea} maxLength={500} rows={2} />}
        </Field>
        <div className="flex flex-wrap gap-[var(--space-24)]">
          <label className={c.check}>
            <input type="checkbox" name="isVeg" defaultChecked={item?.isVeg ?? true} /> Vegetarian (FSSAI green mark)
          </label>
          <label className={c.check}>
            <input type="checkbox" name="isAvailable" defaultChecked={item?.isAvailable ?? true} /> Available
          </label>
        </div>
      </Panel>

      <Panel title="Variants" actions={<span className={c.muted}>Half and full, sizes. Base price is the full plate; a half is a negative delta.</span>}>
        <ChildRows prefix="variants" rows={pad(item?.variants ?? [], BLANK_VARIANTS)} label="Variant" />
      </Panel>

      <Panel title="Option groups" actions={<span className={c.muted}>A group with min 1 is a required choice.</span>}>
        {groups.map((g, gi) => {
          const n = `groups[${gi}]`
          return (
            <fieldset key={g?.id ?? `${n}-new`} className={c.groupBox}>
              <legend>{g ? g.name : 'New group'}</legend>
              <input type="hidden" name={`${n}.id`} value={g?.id ?? ''} />
              <div className={c.inlineForm}>
                <Field id={`${n}.name`} label="Group name" className={c.fieldWide} error={err(`${n}.name`)}>
                  {(p) => <input {...p} name={`${n}.name`} defaultValue={g?.name} className={c.input} placeholder={g ? undefined : 'e.g. Served with'} />}
                </Field>
                <Field id={`${n}.minSelect`} label="Min" className={c.fieldNum} error={err(`${n}.minSelect`)}>
                  {(p) => <input {...p} name={`${n}.minSelect`} defaultValue={g?.minSelect ?? 0} className={`${c.input} num`} inputMode="numeric" />}
                </Field>
                <Field id={`${n}.maxSelect`} label="Max" className={c.fieldNum} error={err(`${n}.maxSelect`)}>
                  {(p) => <input {...p} name={`${n}.maxSelect`} defaultValue={g?.maxSelect ?? 1} className={`${c.input} num`} inputMode="numeric" />}
                </Field>
                {g && (
                  <label className={c.check}>
                    <input type="checkbox" name={`${n}.remove`} /> Remove group
                  </label>
                )}
              </div>
              <ChildRows prefix={`${n}.options`} rows={pad(g?.options ?? [], BLANK_OPTIONS)} label="Option" />
            </fieldset>
          )
        })}
      </Panel>

      <div className={c.actions}>
        <Button type="submit" size="dense" disabled={pending}>{pending ? 'Saving…' : item ? 'Save item' : 'Add item'}</Button>
        <Button href={backHref} size="dense" variant="ghost">Cancel</Button>
      </div>
    </form>
  )
}
