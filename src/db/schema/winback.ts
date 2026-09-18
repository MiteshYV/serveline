import { relations } from 'drizzle-orm'
import { boolean, index, integer, pgTable, text, uniqueIndex, varchar } from 'drizzle-orm/pg-core'
import { createdAt, fk, id, nullableFk, utc } from './_shared.ts'
import { customer } from './customers.ts'
import { discountKind, orderChannel } from './enums.ts'
import { order } from './orders.ts'
import { outlet, platformUser, restaurant } from './tenancy.ts'

// Build Spec §4 "Win-back". The Direct Order Card is where the flywheel starts (Ideation §6):
// a batch is printed, placed in the aggregator's packaging, scanned by the customer, and the
// code redeemed once. Nothing else in the product acquires a customer, so these three tables
// are the entry point the rest of the business depends on.

export const cardBatch = pgTable('card_batch', {
  id: id(),
  restaurantId: fk('restaurant_id').references(() => restaurant.id, { onDelete: 'cascade' }),
  outletId: fk('outlet_id').references(() => outlet.id, { onDelete: 'cascade' }),
  qty: integer('qty').notNull(),
  /** Null until the storage adapter has rendered the batch's PDF. */
  pdfS3Key: text('pdf_s3_key'),
  printedAt: utc('printed_at'),
  placedAt: utc('placed_at'),

  /**
   * Ideation §16 carries "restaurant operators will place the cards reliably" as an untested
   * assumption, tested by auditing placement at week 2. Without these two columns a batch that
   * redeems badly cannot be told apart from a batch that never reached the packaging, and the
   * assumption stays untested however many batches are printed.
   */
  placementAuditedAt: utc('placement_audited_at'),
  auditedBy: nullableFk('audited_by').references(() => platformUser.id, { onDelete: 'set null' }),

  createdAt: createdAt(),
}, (t) => [index('card_batch_restaurant_idx').on(t.restaurantId)])

export const discountCode = pgTable('discount_code', {
  id: id(),
  restaurantId: fk('restaurant_id').references(() => restaurant.id, { onDelete: 'cascade' }),
  code: varchar('code', { length: 32 }).notNull(),
  kind: discountKind('kind').notNull(),
  /** A whole-number percentage, not money. The rupee figure lands in `order.discount_paise`. */
  percent: integer('percent').notNull(),
  /** Null for a code created by hand from the dashboard rather than printed on a card. */
  batchId: nullableFk('batch_id').references(() => cardBatch.id, { onDelete: 'set null' }),
  /**
   * Build Spec §4 gives this a default of 1, and the unique index on `code_redemption` below is
   * what actually holds it. A value above 1 would need that index relaxed first.
   */
  perCustomerLimit: integer('per_customer_limit').notNull().default(1),
  validFrom: utc('valid_from').notNull().defaultNow(),
  /** Null means the code does not expire. */
  validTo: utc('valid_to'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: createdAt(),
}, (t) => [
  // A customer types a code knowing only the restaurant they are ordering from, so uniqueness
  // is per restaurant — two restaurants may both print WELCOME10.
  uniqueIndex('discount_code_restaurant_code_uq').on(t.restaurantId, t.code),
  // Build Spec §7: the dashboard reports redemptions per batch.
  index('discount_code_batch_idx').on(t.batchId),
])

export const codeRedemption = pgTable('code_redemption', {
  id: id(),
  codeId: fk('code_id').references(() => discountCode.id, { onDelete: 'cascade' }),
  /** DPDP erasure is a real delete (CLAUDE.md), so an erased customer takes their redemptions. */
  customerId: fk('customer_id').references(() => customer.id, { onDelete: 'cascade' }),
  /** Orders are never deleted; `restrict` states that rather than leaving it to be found out. */
  orderId: fk('order_id').references(() => order.id, { onDelete: 'restrict' }),
  redeemedAt: utc('redeemed_at').notNull().defaultNow(),
  channel: orderChannel('channel').notNull(),
}, (t) => [
  /**
   * Build Spec §4 requires this index and §6 says what it is for: "one redemption per phone per
   * restaurant, enforced by the unique index". It is a correctness boundary, not a lookup — two
   * checkouts on the same code at the same moment both pass an application-level check, and only
   * the index refuses the second. The redemption path therefore treats a unique violation as the
   * "already redeemed" answer rather than as an unexpected error.
   */
  uniqueIndex('code_redemption_code_customer_uq').on(t.codeId, t.customerId),
])

export const cardBatchRelations = relations(cardBatch, ({ one, many }) => ({
  restaurant: one(restaurant, { fields: [cardBatch.restaurantId], references: [restaurant.id] }),
  outlet: one(outlet, { fields: [cardBatch.outletId], references: [outlet.id] }),
  codes: many(discountCode),
}))

export const discountCodeRelations = relations(discountCode, ({ one, many }) => ({
  restaurant: one(restaurant, { fields: [discountCode.restaurantId], references: [restaurant.id] }),
  batch: one(cardBatch, { fields: [discountCode.batchId], references: [cardBatch.id] }),
  redemptions: many(codeRedemption),
}))

export const codeRedemptionRelations = relations(codeRedemption, ({ one }) => ({
  code: one(discountCode, { fields: [codeRedemption.codeId], references: [discountCode.id] }),
  customer: one(customer, { fields: [codeRedemption.customerId], references: [customer.id] }),
  order: one(order, { fields: [codeRedemption.orderId], references: [order.id] }),
}))
