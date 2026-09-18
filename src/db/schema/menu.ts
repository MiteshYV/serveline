import { relations } from 'drizzle-orm'
import { boolean, index, integer, pgTable, text, uniqueIndex } from 'drizzle-orm/pg-core'
import { createdAt, fk, id, nullableFk, utc } from './_shared.ts'
import { spiceLevel } from './enums.ts'
import { outlet, staffUser } from './tenancy.ts'

export const menu = pgTable('menu', {
  id: id(),
  outletId: fk('outlet_id').references(() => outlet.id, { onDelete: 'cascade' }),
  /** Build Spec §7: publishing bumps the version, and that is what refreshes the voice cache. */
  version: integer('version').notNull().default(1),
  // Null means this version is still a draft in the dashboard.
  publishedAt: utc('published_at'),
  /**
   * Null when no staff member published it: Build Spec §8 lets the agent console publish on the
   * restaurant's behalf, and a staff member who later leaves must not take the menu with them.
   */
  publishedBy: nullableFk('published_by').references(() => staffUser.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('menu_outlet_version_uq').on(t.outletId, t.version)])

export const menuCategory = pgTable('menu_category', {
  id: id(),
  menuId: fk('menu_id').references(() => menu.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  sort: integer('sort').notNull().default(0),
}, (t) => [index('menu_category_menu_idx').on(t.menuId)])

export const menuItem = pgTable('menu_item', {
  id: id(),
  // Build Spec §4 carries both keys. menu_id is worth the duplication because the ordering page
  // reads a whole menu at once and would otherwise join through the category to do it.
  menuId: fk('menu_id').references(() => menu.id, { onDelete: 'cascade' }),
  categoryId: fk('category_id').references(() => menuCategory.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  pricePaise: integer('price_paise').notNull(),
  isVeg: boolean('is_veg').notNull().default(false),
  // The enum carries 'none', so there is no reason for this to be nullable.
  spiceLevel: spiceLevel('spice_level').notNull().default('none'),
  allergens: text('allergens').array().notNull().default([]),
  tags: text('tags').array().notNull().default([]),
  /** Build Spec §7: the counter toggles this to mark an item sold out for the day. */
  isAvailable: boolean('is_available').notNull().default(true),
  sort: integer('sort').notNull().default(0),
}, (t) => [
  // Build Spec §6: the ordering page reads the whole menu, then the items of a category. The
  // leading column serves the first read and the pair serves the second, so one index does both.
  index('menu_item_menu_category_idx').on(t.menuId, t.categoryId),
])

/** Build Spec §4: half and full, sizes. The delta is negative where a half portion costs less. */
export const itemVariant = pgTable('item_variant', {
  id: id(),
  itemId: fk('item_id').references(() => menuItem.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  priceDeltaPaise: integer('price_delta_paise').notNull().default(0),
}, (t) => [index('item_variant_item_idx').on(t.itemId)])

export const itemOptionGroup = pgTable('item_option_group', {
  id: id(),
  itemId: fk('item_id').references(() => menuItem.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  // Defaults describe the ordinary group: optional, and at most one choice.
  minSelect: integer('min_select').notNull().default(0),
  maxSelect: integer('max_select').notNull().default(1),
}, (t) => [index('item_option_group_item_idx').on(t.itemId)])

export const itemOption = pgTable('item_option', {
  id: id(),
  groupId: fk('group_id').references(() => itemOptionGroup.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  priceDeltaPaise: integer('price_delta_paise').notNull().default(0),
}, (t) => [index('item_option_group_idx').on(t.groupId)])

export const menuRelations = relations(menu, ({ one, many }) => ({
  outlet: one(outlet, { fields: [menu.outletId], references: [outlet.id] }),
  publisher: one(staffUser, { fields: [menu.publishedBy], references: [staffUser.id] }),
  categories: many(menuCategory),
  items: many(menuItem),
}))

export const menuCategoryRelations = relations(menuCategory, ({ one, many }) => ({
  menu: one(menu, { fields: [menuCategory.menuId], references: [menu.id] }),
  items: many(menuItem),
}))

export const menuItemRelations = relations(menuItem, ({ one, many }) => ({
  menu: one(menu, { fields: [menuItem.menuId], references: [menu.id] }),
  category: one(menuCategory, { fields: [menuItem.categoryId], references: [menuCategory.id] }),
  variants: many(itemVariant),
  optionGroups: many(itemOptionGroup),
}))

export const itemVariantRelations = relations(itemVariant, ({ one }) => ({
  item: one(menuItem, { fields: [itemVariant.itemId], references: [menuItem.id] }),
}))

export const itemOptionGroupRelations = relations(itemOptionGroup, ({ one, many }) => ({
  item: one(menuItem, { fields: [itemOptionGroup.itemId], references: [menuItem.id] }),
  options: many(itemOption),
}))

export const itemOptionRelations = relations(itemOption, ({ one }) => ({
  group: one(itemOptionGroup, { fields: [itemOption.groupId], references: [itemOptionGroup.id] }),
}))
