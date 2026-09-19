/**
 * The menu-item editor's form contract: the field names the form renders and the parser that
 * turns the posted `FormData` into `UpsertItemInput` for `repos/menu.upsertItem`. Shared by the
 * agent console now and the dashboard's item editor (Build Spec §7) when it is built, so the two
 * cannot post different shapes.
 *
 * Child rows are positional and contiguous from 0: `variants[0].name`, `groups[1].options[2].id`.
 * A row with no `id`, a blank name and a blank delta is an unused blank row and is skipped; a
 * row with its `remove` box ticked is dropped, which `upsertItem` turns into a delete. Errors
 * come back keyed by the same field names, so the form can put each one under its input.
 *
 * ponytail: the form renders N existing rows plus a fixed number of blank ones and no client
 * state; adding more than that many at once means saving and editing again. The upgrade is an
 * "add row" button, which is client state and a re-index.
 */

import { z } from 'zod'
import { parseINR } from '../core/money.ts'
import type { UpsertItemInput } from '../db/repos/menu.ts'

export const SPICE_LEVELS = ['none', 'mild', 'medium', 'hot'] as const

export type ItemFormResult =
  | { ok: true; input: UpsertItemInput }
  | { ok: false; errors: Record<string, string> }

const rupees = z.string().trim().transform((s, ctx) => {
  try {
    return parseINR(s === '' ? '0' : s)
  } catch {
    ctx.addIssue({ code: 'custom', message: 'Enter rupees, e.g. 240 or 240.50' })
    return z.NEVER
  }
})

const optionalId = z.uuid().optional()
const shortText = (max: number) => z.string().trim().min(1, 'Required').max(max, `At most ${max} characters`)
const smallInt = (min: number, max: number) => z.coerce.number().int('Whole number').min(min).max(max)

const child = z.object({ id: optionalId, name: shortText(80), priceDeltaPaise: rupees }).nullable()

const group = z.object({
  id: optionalId,
  name: shortText(80),
  minSelect: smallInt(0, 20),
  maxSelect: smallInt(1, 20),
  options: z.array(child),
}).nullable()

const schema = z.object({
  id: optionalId,
  categoryId: z.uuid('Choose a category'),
  name: shortText(120),
  description: z.string().trim().max(500, 'At most 500 characters'),
  pricePaise: rupees.refine((p) => p >= 0, 'Price cannot be negative'),
  isVeg: z.boolean(),
  spiceLevel: z.enum(SPICE_LEVELS),
  isAvailable: z.boolean(),
  sort: smallInt(0, 9999),
  allergens: z.array(z.string()),
  tags: z.array(z.string()),
  variants: z.array(child),
  groups: z.array(group),
})

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** `['groups', 1, 'options', 0, 'name']` → `groups[1].options[0].name`, the input's `name`. */
const fieldKey = (path: readonly PropertyKey[]): string =>
  path.reduce<string>((acc, part) => (typeof part === 'number' ? `${acc}[${part}]` : acc ? `${acc}.${String(part)}` : String(part)), '')

export function parseItemForm(fd: FormData): ItemFormResult {
  const str = (k: string) => {
    const v = fd.get(k)
    return typeof v === 'string' ? v : ''
  }
  const on = (k: string) => fd.get(k) !== null
  const csv = (k: string) => str(k).split(',').map((s) => s.trim()).filter(Boolean)
  const slots = (prefix: string): number[] => {
    const re = new RegExp(`^${escapeRe(prefix)}\\[(\\d+)\\]\\.`)
    const out = new Set<number>()
    for (const key of fd.keys()) {
      const m = re.exec(key)
      if (m) out.add(Number(m[1]))
    }
    return [...out].sort((a, b) => a - b)
  }
  const childRow = (prefix: string, i: number) => {
    const id = str(`${prefix}[${i}].id`) || undefined
    const name = str(`${prefix}[${i}].name`)
    const priceDeltaPaise = str(`${prefix}[${i}].priceDeltaPaise`)
    const blank = !id && name.trim() === '' && priceDeltaPaise.trim() === ''
    return on(`${prefix}[${i}].remove`) || blank ? null : { id, name, priceDeltaPaise }
  }

  const raw = {
    id: str('id') || undefined,
    categoryId: str('categoryId'),
    name: str('name'),
    description: str('description'),
    pricePaise: str('pricePaise'),
    isVeg: on('isVeg'),
    spiceLevel: str('spiceLevel'),
    isAvailable: on('isAvailable'),
    sort: str('sort') || '0',
    allergens: csv('allergens'),
    tags: csv('tags'),
    variants: slots('variants').map((i) => childRow('variants', i)),
    groups: slots('groups').map((g) => {
      const p = `groups[${g}]`
      const id = str(`${p}.id`) || undefined
      const name = str(`${p}.name`)
      const options = slots(`${p}.options`).map((o) => childRow(`${p}.options`, o))
      const blank = !id && name.trim() === '' && options.every((o) => o === null)
      return on(`${p}.remove`) || blank
        ? null
        : { id, name, minSelect: str(`${p}.minSelect`) || '0', maxSelect: str(`${p}.maxSelect`) || '1', options }
    }),
  }

  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    const errors: Record<string, string> = {}
    for (const issue of parsed.error.issues) errors[fieldKey(issue.path)] ??= issue.message
    return { ok: false, errors }
  }

  const d = parsed.data
  const present = <T>(rows: (T | null)[]): T[] => rows.filter((r): r is T => r !== null)
  const errors: Record<string, string> = {}
  const groups = present(d.groups).map((g, gi) => {
    const options = present(g.options)
    if (options.length === 0) errors[`groups[${d.groups.indexOf(g)}].name`] = 'A group needs at least one option'
    if (g.maxSelect < g.minSelect) errors[`groups[${d.groups.indexOf(g)}].maxSelect`] = 'Max must be at least min'
    void gi
    return { id: g.id, name: g.name, minSelect: g.minSelect, maxSelect: g.maxSelect, options }
  })
  if (Object.keys(errors).length > 0) return { ok: false, errors }

  return {
    ok: true,
    input: {
      id: d.id,
      categoryId: d.categoryId,
      name: d.name,
      description: d.description === '' ? null : d.description,
      pricePaise: d.pricePaise,
      isVeg: d.isVeg,
      spiceLevel: d.spiceLevel,
      isAvailable: d.isAvailable,
      sort: d.sort,
      allergens: d.allergens,
      tags: d.tags,
      variants: present(d.variants),
      optionGroups: groups,
    },
  }
}

/** The inverse for the form's `defaultValue`: paise → "240.50", by integer arithmetic only. */
export const paiseToInput = (p: number): string => {
  const abs = Math.abs(p)
  return `${p < 0 ? '-' : ''}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, '0')}`
}
