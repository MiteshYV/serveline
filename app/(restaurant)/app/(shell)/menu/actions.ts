'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { getMenuForEditing, publishMenu, setItemAvailability, upsertItem, type UpsertItemInput } from '@/db/repos/index.ts'
import { currentOutlet } from '../../_lib/session.ts'
import { parseINR } from '@/core/money.ts'

/** Build Spec §7 "Menu: availability toggles per item (sold out today)". Live at once; no publish needed. */
export async function setAvailability(form: FormData): Promise<void> {
  const parsed = z.object({ itemId: z.uuid(), available: z.enum(['0', '1']) }).safeParse({ itemId: form.get('itemId'), available: form.get('available') })
  if (!parsed.success) return
  const { outlet, actor } = await currentOutlet()
  // Item ids are public — they ship to every browser on /r/{slug} — so the id alone proves
  // nothing. The item must be on this outlet's menu, as saveItem checks below (Build Spec §10:
  // staff act on their own restaurant). The editor's view, not the published one: a draft's
  // items are this outlet's too.
  const menu = await getMenuForEditing(outlet.id)
  if (!menu || !menu.items.some((i) => i.id === parsed.data.itemId)) return
  await setItemAvailability(parsed.data.itemId, parsed.data.available === '1', actor)
  revalidatePath('/app/menu')
  revalidatePath('/app/orders/new')
}

/** Build Spec §7: "Publishing bumps menu.version and refreshes the voice cache." */
export async function publish(): Promise<void> {
  const { outlet, actor } = await currentOutlet()
  await publishMenu(outlet.id, actor)
  revalidatePath('/app/menu')
}

/** Form fields arrive as rupees; core's parseINR is the one rupee→paise conversion. Null, not a throw: the form shows a field error. */
const parseRupees = (raw: string): number | null => {
  try { return parseINR(raw) } catch { return null }
}

export type ItemFormState = { error?: string; fieldErrors?: Record<string, string> }

const Item = z.object({
  id: z.uuid().optional(),
  categoryId: z.uuid(),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500),
  pricePaise: z.number().int().min(0),
  isVeg: z.boolean(),
  spiceLevel: z.enum(['none', 'mild', 'medium', 'hot']),
  isAvailable: z.boolean(),
  variants: z.array(z.object({ id: z.uuid().optional(), name: z.string().trim().min(1).max(60), priceDeltaPaise: z.number().int() })),
  optionGroups: z.array(z.object({
    id: z.uuid().optional(),
    name: z.string().trim().min(1).max(60),
    minSelect: z.number().int().min(0).max(20),
    maxSelect: z.number().int().min(1).max(20),
    options: z.array(z.object({ id: z.uuid().optional(), name: z.string().trim().min(1).max(60), priceDeltaPaise: z.number().int() })).min(1),
  })),
})

const MAX_VARIANTS = 6
const MAX_GROUPS = 3
const MAX_OPTIONS = 6

const str = (form: FormData, key: string) => (typeof form.get(key) === 'string' ? (form.get(key) as string) : '')
const optionalId = (v: string) => (v ? v : undefined)

/**
 * Build Spec §7 "item add and edit with variants and options". The form is a fixed grid of rows;
 * a row with an empty name is an empty row and is dropped, which is how a variant or option is
 * removed too. Ids travel in hidden fields so the repository can diff children.
 */
export async function saveItem(_prev: ItemFormState, form: FormData): Promise<ItemFormState> {
  const fieldErrors: Record<string, string> = {}
  const price = parseRupees(str(form, 'price'))
  if (price === null || price < 0) fieldErrors.price = 'Enter a price in rupees, like 240 or 240.50'

  const variants: NonNullable<UpsertItemInput['variants']> = []
  for (let i = 0; i < MAX_VARIANTS; i += 1) {
    const name = str(form, `variant[${i}].name`).trim()
    if (!name) continue
    const delta = parseRupees(str(form, `variant[${i}].delta`) || '0')
    if (delta === null) {
      fieldErrors[`variant[${i}].delta`] = 'Enter a rupee amount; negative for a smaller portion'
      continue
    }
    // Finding negative-unit-price-cart: a delta bigger than the base price priced the line below
    // zero. `upsertItem` refuses the row; this says so under the input that caused it.
    if (price !== null && price + delta < 0) {
      fieldErrors[`variant[${i}].delta`] = 'This takes the price below zero'
      continue
    }
    variants.push({ id: optionalId(str(form, `variant[${i}].id`)), name, priceDeltaPaise: delta })
  }

  const optionGroups: NonNullable<UpsertItemInput['optionGroups']> = []
  for (let g = 0; g < MAX_GROUPS; g += 1) {
    const name = str(form, `group[${g}].name`).trim()
    if (!name) continue
    const options: { id?: string; name: string; priceDeltaPaise: number }[] = []
    for (let o = 0; o < MAX_OPTIONS; o += 1) {
      const oname = str(form, `group[${g}].option[${o}].name`).trim()
      if (!oname) continue
      const delta = parseRupees(str(form, `group[${g}].option[${o}].delta`) || '0')
      if (delta === null) {
        fieldErrors[`group[${g}].option[${o}].delta`] = 'Enter a rupee amount'
        continue
      }
      if (price !== null && price + delta < 0) {
        fieldErrors[`group[${g}].option[${o}].delta`] = 'This takes the price below zero'
        continue
      }
      options.push({ id: optionalId(str(form, `group[${g}].option[${o}].id`)), name: oname, priceDeltaPaise: delta })
    }
    const minSelect = Number(str(form, `group[${g}].min`) || '0')
    const maxSelect = Number(str(form, `group[${g}].max`) || '1')
    if (options.length === 0) fieldErrors[`group[${g}].name`] = 'A group needs at least one option'
    if (!(minSelect <= maxSelect)) fieldErrors[`group[${g}].min`] = 'Minimum cannot exceed maximum'
    optionGroups.push({ id: optionalId(str(form, `group[${g}].id`)), name, minSelect, maxSelect, options })
  }

  if (Object.keys(fieldErrors).length > 0) return { fieldErrors }

  const { outlet, actor } = await currentOutlet()
  // The category must belong to this outlet's menu; upsertItem derives menu_id from it.
  const { getPublishedMenu } = await import('@/db/repos/index.ts')
  const menu = await getPublishedMenu(outlet.id)
  if (!menu) return { error: 'Unknown category' }

  // Availability is not a field on this form. It is the immediate switch on /app/menu — one
  // control, not two — so an edit carries whatever the counter last set, and a new item starts
  // available. A deferred checkbox here would let a Save undo a sold-out flag set mid-rush.
  const id = optionalId(str(form, 'id'))
  const isAvailable = id ? (menu.items.find((i) => i.id === id)?.isAvailable ?? true) : true

  const parsed = Item.safeParse({
    id,
    categoryId: str(form, 'categoryId'),
    name: str(form, 'name'),
    description: str(form, 'description'),
    pricePaise: price,
    isVeg: form.get('isVeg') === 'on',
    spiceLevel: str(form, 'spiceLevel') || 'none',
    isAvailable,
    variants,
    optionGroups,
  })
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return { error: first ? `${first.path.join('.')}: ${first.message}` : 'Check the form and try again' }
  }

  if (!menu.categories.some((c) => c.id === parsed.data.categoryId)) return { error: 'Unknown category' }
  if (parsed.data.id && !menu.items.some((i) => i.id === parsed.data.id)) return { error: 'Unknown item' }

  try {
    await upsertItem({ ...parsed.data, description: parsed.data.description || null }, actor)
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not save' }
  }
  revalidatePath('/app/menu')
  revalidatePath('/app/orders/new')
  redirect('/app/menu')
}
