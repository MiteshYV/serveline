/**
 * The catalogue: what the ordering page renders, what the cart prices against, and what the
 * dashboard's menu editor writes (Build Spec §6, §7).
 *
 * One `menu` row per outlet. Availability toggles, price edits and item edits land on it in
 * place and are live on the ordering page at once — "sold out today" cannot wait for a publish.
 * Publishing does the one thing Build Spec §7 says it does: bumps `menu.version`, which is what
 * the voice cache keys on at M2. `published_at` null means the row has never been published and
 * the ordering page will not show it.
 */

import { and, asc, desc, eq, isNotNull, notInArray } from 'drizzle-orm'
import type { PricedMenuItem } from '../../core/cart.ts'
import { paise } from '../../core/money.ts'
import { db } from '../client.ts'
import {
  itemOption, itemOptionGroup, itemVariant, menu, menuCategory, menuItem,
} from '../schema/index.ts'
import { type Actor, type Executor, type Tx, firstRow, writeAudit } from './ops.ts'

type MenuRow = typeof menu.$inferSelect
type CategoryRow = typeof menuCategory.$inferSelect
type ItemRow = typeof menuItem.$inferSelect
type VariantRow = typeof itemVariant.$inferSelect
type OptionGroupRow = typeof itemOptionGroup.$inferSelect
type OptionRow = typeof itemOption.$inferSelect

export type PublishedOptionGroup = OptionGroupRow & { options: OptionRow[] }
export type PublishedItem = ItemRow & { variants: VariantRow[]; optionGroups: PublishedOptionGroup[] }
export type PublishedCategory = CategoryRow & { items: PublishedItem[] }

/**
 * `categories` is the tree the page renders; `items` is the same item objects flattened, for
 * anything that looks an item up by id — the cart, and `createOrder` snapshotting names.
 */
export type PublishedMenu = {
  menu: MenuRow
  categories: PublishedCategory[]
  items: PublishedItem[]
}

/**
 * ponytail: variants and options have no sort column (Build Spec §4), so they come back cheapest
 * first, then by name — Half before Full, Roti before Butter naan. The upgrade is a `sort`
 * column on both tables when a restaurant asks for a different order.
 */
const itemChildren = {
  variants: { orderBy: [asc(itemVariant.priceDeltaPaise), asc(itemVariant.name)] },
  optionGroups: {
    orderBy: [asc(itemOptionGroup.name)],
    with: { options: { orderBy: [asc(itemOption.priceDeltaPaise), asc(itemOption.name)] } },
  },
}

const menuTree = {
  categories: {
    orderBy: [asc(menuCategory.sort), asc(menuCategory.name)],
    with: {
      items: { orderBy: [asc(menuItem.sort), asc(menuItem.name)], with: itemChildren },
    },
  },
}

async function loadMenu(outletId: string, publishedOnly: boolean): Promise<PublishedMenu | null> {
  const row = await db.query.menu.findFirst({
    where: and(eq(menu.outletId, outletId), publishedOnly ? isNotNull(menu.publishedAt) : undefined),
    orderBy: [desc(menu.version)],
    with: menuTree,
  })
  if (!row) return null
  const { categories, ...menuRow } = row
  return { menu: menuRow, categories, items: categories.flatMap((c) => c.items) }
}

export const getPublishedMenu = (outletId: string) => loadMenu(outletId, true)

/**
 * The editor's view (Build Spec §7 menu editing, §8 agent console): the outlet's latest menu row
 * whether or not it has been published. `getPublishedMenu` hides a draft on purpose; an editor
 * must not, or a new restaurant's menu could never be built.
 */
export const getMenuForEditing = (outletId: string) => loadMenu(outletId, false)

/**
 * The map from a loaded menu to what `priceCart` reads. Sold-out items are left out, so a cart
 * holding one is refused by pricing itself (`unknown_item`) rather than by whichever surface
 * remembered to check `isAvailable` — the voice service at M2 must not sell it either. The page
 * still renders them: they are in `categories`, marked `isAvailable: false`.
 */
export function toPricedMenu({ items }: Pick<PublishedMenu, 'items'>): PricedMenuItem[] {
  return items
    .filter((item) => item.isAvailable)
    .map((item) => ({
      id: item.id,
      name: item.name,
      pricePaise: paise(item.pricePaise),
      variants: item.variants.map((v) => ({
        id: v.id, name: v.name, priceDeltaPaise: paise(v.priceDeltaPaise),
      })),
      optionGroups: item.optionGroups.map((g) => ({
        id: g.id,
        name: g.name,
        minSelect: g.minSelect,
        maxSelect: g.maxSelect,
        options: g.options.map((o) => ({
          id: o.id, name: o.name, priceDeltaPaise: paise(o.priceDeltaPaise),
        })),
      })),
    }))
}

async function loadItem(exec: Executor, itemId: string): Promise<PublishedItem | null> {
  const row = await exec.query.menuItem.findFirst({ where: eq(menuItem.id, itemId), with: itemChildren })
  return row ?? null
}

/** Build Spec §7: "availability toggles per item (sold out today)". */
export async function setItemAvailability(itemId: string, isAvailable: boolean, actor: Actor) {
  return db.transaction(async (tx) => {
    const before = await tx.query.menuItem.findFirst({ where: eq(menuItem.id, itemId) })
    if (!before) throw new Error(`No menu item ${itemId}`)
    const after = firstRow(
      await tx.update(menuItem).set({ isAvailable }).where(eq(menuItem.id, itemId)).returning(),
      `menu_item ${itemId}`,
    )
    await writeAudit({
      actorType: actor.type,
      actorId: actor.id,
      action: 'menu_item.availability',
      entity: 'menu_item',
      entityId: itemId,
      before: { isAvailable: before.isAvailable },
      after: { isAvailable },
    }, tx)
    return after
  })
}

/**
 * An item as the editor holds it. With `id`, an edit; without, a create. On an edit, a scalar
 * field left `undefined` keeps its stored value, and `variants` / `optionGroups` left `undefined`
 * are left alone — pass `[]` to remove them all. Children are matched by id: with one, updated;
 * without, inserted; existing rows not in the list are deleted.
 */
export type UpsertItemInput = {
  id?: string
  categoryId: string
  name: string
  description?: string | null
  pricePaise: number
  isVeg?: boolean
  spiceLevel?: ItemRow['spiceLevel']
  allergens?: string[]
  tags?: string[]
  isAvailable?: boolean
  sort?: number
  variants?: { id?: string; name: string; priceDeltaPaise: number }[]
  optionGroups?: {
    id?: string
    name: string
    minSelect?: number
    maxSelect?: number
    options: { id?: string; name: string; priceDeltaPaise: number }[]
  }[]
}

export async function upsertItem(input: UpsertItemInput, actor: Actor): Promise<PublishedItem> {
  return db.transaction(async (tx) => {
    // `menu_id` is derived from the category so the two keys the row carries cannot disagree.
    const category = await tx.query.menuCategory.findFirst({ where: eq(menuCategory.id, input.categoryId) })
    if (!category) throw new Error(`No menu category ${input.categoryId}`)

    const before = input.id ? await loadItem(tx, input.id) : null
    if (input.id && !before) throw new Error(`No menu item ${input.id}`)

    const fields = {
      menuId: category.menuId,
      categoryId: category.id,
      name: input.name,
      description: input.description === undefined ? (before?.description ?? null) : input.description,
      pricePaise: paise(input.pricePaise),
      isVeg: input.isVeg ?? before?.isVeg ?? false,
      spiceLevel: input.spiceLevel ?? before?.spiceLevel ?? 'none',
      allergens: input.allergens ?? before?.allergens ?? [],
      tags: input.tags ?? before?.tags ?? [],
      isAvailable: input.isAvailable ?? before?.isAvailable ?? true,
      sort: input.sort ?? before?.sort ?? 0,
    }

    const itemId = before
      ? firstRow(
        await tx.update(menuItem).set(fields).where(eq(menuItem.id, before.id)).returning({ id: menuItem.id }),
        `menu_item ${before.id}`,
      ).id
      : firstRow(await tx.insert(menuItem).values(fields).returning({ id: menuItem.id }), 'menu_item').id

    if (input.variants ?? !before) await syncVariants(tx, itemId, input.variants ?? [])
    if (input.optionGroups ?? !before) await syncOptionGroups(tx, itemId, input.optionGroups ?? [])

    const after = await loadItem(tx, itemId)
    if (!after) throw new Error(`menu_item ${itemId} vanished inside its own transaction`)

    await writeAudit({
      actorType: actor.type,
      actorId: actor.id,
      action: before ? 'menu_item.update' : 'menu_item.create',
      entity: 'menu_item',
      entityId: itemId,
      before,
      after,
    }, tx)
    return after
  })
}

const keptIds = (rows: { id?: string }[]) => rows.flatMap((r) => (r.id ? [r.id] : []))

/**
 * ponytail: removing a variant that an order has already referenced fails on the `restrict`
 * foreign key from `order_item`, and the whole edit rolls back with the database's error. The
 * upgrade is an `is_available` flag on `item_variant` so a retired size is hidden, not deleted.
 */
async function syncVariants(tx: Tx, itemId: string, wanted: NonNullable<UpsertItemInput['variants']>) {
  const keep = keptIds(wanted)
  await tx.delete(itemVariant).where(and(
    eq(itemVariant.itemId, itemId),
    keep.length ? notInArray(itemVariant.id, keep) : undefined,
  ))
  for (const v of wanted) {
    const values = { itemId, name: v.name, priceDeltaPaise: paise(v.priceDeltaPaise) }
    if (v.id) {
      firstRow(
        await tx.update(itemVariant).set(values)
          .where(and(eq(itemVariant.id, v.id), eq(itemVariant.itemId, itemId)))
          .returning({ id: itemVariant.id }),
        `item_variant ${v.id}`,
      )
    } else {
      await tx.insert(itemVariant).values(values)
    }
  }
}

async function syncOptionGroups(tx: Tx, itemId: string, wanted: NonNullable<UpsertItemInput['optionGroups']>) {
  const keep = keptIds(wanted)
  // Options go with their group: `item_option.group_id` cascades.
  await tx.delete(itemOptionGroup).where(and(
    eq(itemOptionGroup.itemId, itemId),
    keep.length ? notInArray(itemOptionGroup.id, keep) : undefined,
  ))
  for (const g of wanted) {
    const minSelect = g.minSelect ?? 0
    const maxSelect = g.maxSelect ?? 1
    // A group nobody can satisfy makes the item unorderable on every channel (core/cart min_select).
    if (minSelect < 0 || maxSelect < minSelect) {
      throw new Error(`Option group "${g.name}": min_select ${minSelect} exceeds max_select ${maxSelect}`)
    }
    const values = { itemId, name: g.name, minSelect, maxSelect }
    const groupId = g.id
      ? firstRow(
        await tx.update(itemOptionGroup).set(values)
          .where(and(eq(itemOptionGroup.id, g.id), eq(itemOptionGroup.itemId, itemId)))
          .returning({ id: itemOptionGroup.id }),
        `item_option_group ${g.id}`,
      ).id
      : firstRow(await tx.insert(itemOptionGroup).values(values).returning({ id: itemOptionGroup.id }), 'item_option_group').id

    const keepOptions = keptIds(g.options)
    await tx.delete(itemOption).where(and(
      eq(itemOption.groupId, groupId),
      keepOptions.length ? notInArray(itemOption.id, keepOptions) : undefined,
    ))
    for (const o of g.options) {
      const optionValues = { groupId, name: o.name, priceDeltaPaise: paise(o.priceDeltaPaise) }
      if (o.id) {
        firstRow(
          await tx.update(itemOption).set(optionValues)
            .where(and(eq(itemOption.id, o.id), eq(itemOption.groupId, groupId)))
            .returning({ id: itemOption.id }),
          `item_option ${o.id}`,
        )
      } else {
        await tx.insert(itemOption).values(optionValues)
      }
    }
  }
}

/**
 * Build Spec §7: "Publishing bumps `menu.version` and refreshes the voice cache." The first
 * publish of a draft also bumps — the version is a cache key, not a display number.
 * `published_by` is a staff_user or null: the agent console publishes on the restaurant's behalf.
 */
export async function publishMenu(outletId: string, actor: Actor): Promise<MenuRow> {
  return db.transaction(async (tx) => {
    const current = await tx.query.menu.findFirst({
      where: eq(menu.outletId, outletId),
      orderBy: [desc(menu.version)],
    })
    if (!current) throw new Error(`No menu for outlet ${outletId}`)

    const after = firstRow(
      await tx.update(menu)
        .set({
          version: current.version + 1,
          publishedAt: new Date(),
          publishedBy: actor.type === 'staff' ? actor.id : null,
        })
        .where(eq(menu.id, current.id))
        .returning(),
      `menu ${current.id}`,
    )
    await writeAudit({
      actorType: actor.type,
      actorId: actor.id,
      action: 'menu.publish',
      entity: 'menu',
      entityId: current.id,
      before: { version: current.version, publishedAt: current.publishedAt },
      after: { version: after.version, publishedAt: after.publishedAt },
    }, tx)
    return after
  })
}

// --- editor writes the contract did not name: the menu row itself, categories, deletes -------

/** The outlet's menu row, created as an unpublished draft if it has none (a new restaurant). */
export async function ensureMenu(outletId: string, actor: Actor): Promise<MenuRow> {
  return db.transaction(async (tx) => {
    const existing = await tx.query.menu.findFirst({
      where: eq(menu.outletId, outletId),
      orderBy: [desc(menu.version)],
    })
    if (existing) return existing
    const row = firstRow(await tx.insert(menu).values({ outletId }).returning(), 'menu')
    await writeAudit({
      actorType: actor.type,
      actorId: actor.id,
      action: 'menu.create',
      entity: 'menu',
      entityId: row.id,
      before: null,
      after: row,
    }, tx)
    return row
  })
}

/** With `id`, a rename or re-sort; without, a new category on `menuId`. */
export async function upsertCategory(
  input: { id?: string; menuId: string; name: string; sort?: number },
  actor: Actor,
): Promise<CategoryRow> {
  const name = input.name.trim()
  if (!name) throw new Error('A category needs a name')
  return db.transaction(async (tx) => {
    const before = input.id
      ? await tx.query.menuCategory.findFirst({ where: eq(menuCategory.id, input.id) })
      : null
    if (input.id && !before) throw new Error(`No menu category ${input.id}`)
    const values = { menuId: input.menuId, name, sort: input.sort ?? before?.sort ?? 0 }
    const row = before
      ? firstRow(await tx.update(menuCategory).set(values).where(eq(menuCategory.id, before.id)).returning(), `menu_category ${before.id}`)
      : firstRow(await tx.insert(menuCategory).values(values).returning(), 'menu_category')
    await writeAudit({
      actorType: actor.type,
      actorId: actor.id,
      action: before ? 'menu_category.update' : 'menu_category.create',
      entity: 'menu_category',
      entityId: row.id,
      before,
      after: row,
    }, tx)
    return row
  })
}

/**
 * Deletes the category and, by cascade, its items. An item that has ever been ordered holds
 * `order_item`'s `restrict` foreign key and the delete fails whole — mark it unavailable instead.
 */
export async function deleteCategory(categoryId: string, actor: Actor): Promise<void> {
  await db.transaction(async (tx) => {
    const before = await tx.query.menuCategory.findFirst({ where: eq(menuCategory.id, categoryId) })
    if (!before) throw new Error(`No menu category ${categoryId}`)
    await tx.delete(menuCategory).where(eq(menuCategory.id, categoryId))
    await writeAudit({
      actorType: actor.type,
      actorId: actor.id,
      action: 'menu_category.delete',
      entity: 'menu_category',
      entityId: categoryId,
      before,
      after: null,
    }, tx)
  })
}

/** Same `restrict` caveat as `deleteCategory`: an ordered item cannot be deleted, only hidden. */
export async function deleteItem(itemId: string, actor: Actor): Promise<void> {
  await db.transaction(async (tx) => {
    const before = await loadItem(tx, itemId)
    if (!before) throw new Error(`No menu item ${itemId}`)
    await tx.delete(menuItem).where(eq(menuItem.id, itemId))
    await writeAudit({
      actorType: actor.type,
      actorId: actor.id,
      action: 'menu_item.delete',
      entity: 'menu_item',
      entityId: itemId,
      before,
      after: null,
    }, tx)
  })
}
