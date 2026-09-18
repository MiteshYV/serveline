import { relations } from 'drizzle-orm'
import { boolean, index, integer, jsonb, pgTable, text, varchar } from 'drizzle-orm/pg-core'
import { createdAt, fk, id, nullableFk, utc } from './_shared.ts'
import {
  actorType, addressStatus, fulfilment, orderChannel, orderStatus, paymentMethod, paymentStatus,
} from './enums.ts'
import { customer, customerAddress } from './customers.ts'
import { itemVariant, menuItem } from './menu.ts'
import { outlet, restaurant, staffUser } from './tenancy.ts'
import { discountCode } from './winback.ts'

// Build Spec §4 "Orders and payments". Every money column is integer paise (CLAUDE.md); there is
// no rupee value and no decimal column anywhere in this file.

export const order = pgTable('order', {
  id: id(),
  restaurantId: fk('restaurant_id').references(() => restaurant.id, { onDelete: 'cascade' }),
  outletId: fk('outlet_id').references(() => outlet.id, { onDelete: 'cascade' }),
  /**
   * Nullable: an order can exist without a profile (staff manual entry, a diner who declines
   * consent). DPDP erasure is a real delete of the customer, and the order must survive it as a
   * financial record — hence `set null` rather than a cascade.
   */
  customerId: nullableFk('customer_id').references(() => customer.id, { onDelete: 'set null' }),

  channel: orderChannel('channel').notNull(),
  fulfilment: fulfilment('fulfilment').notNull(),
  /** Set only for `dine_in`; pre-filled from the `t` query parameter (Build Spec §6). */
  tableNo: varchar('table_no', { length: 16 }),
  status: orderStatus('status').notNull().default('received'),

  subtotalPaise: integer('subtotal_paise').notNull(),
  discountPaise: integer('discount_paise').notNull().default(0),
  /**
   * orders.ts and winback.ts import each other (code_redemption references order). That is
   * safe: both sides only touch the other table inside a `() =>` thunk, which Drizzle calls
   * after every module has finished evaluating. Do not "fix" the cycle by dropping the FK.
   */
  discountCodeId: nullableFk('discount_code_id').references(() => discountCode.id, { onDelete: 'set null' }),
  totalPaise: integer('total_paise').notNull(),

  paymentMethod: paymentMethod('payment_method').notNull(),
  paymentStatus: paymentStatus('payment_status').notNull().default('unpaid'),

  /** Null for pickup and dine-in. `set null` for the same erasure reason as `customer_id`. */
  addressId: nullableFk('address_id').references(() => customerAddress.id, { onDelete: 'set null' }),
  addressStatus: addressStatus('address_status').notNull().default('na'),

  notes: text('notes'),

  // `call_id` is deliberately absent. M1 has no call pipeline, and the M2 migration adds the
  // column when `call` exists (M1 design, "Data model").

  placedAt: utc('placed_at').notNull().defaultNow(),
  confirmedAt: utc('confirmed_at'),
  deliveredAt: utc('delivered_at'),
  /** Required on any transition to `cancelled`; enforced in src/core/orders, not by the column. */
  cancelledReason: text('cancelled_reason'),

  /** Ideation §9: the numerator of order error rate, which the pilot holds under 2%. */
  correctionFlag: boolean('correction_flag').notNull().default(false),
  correctedAt: utc('corrected_at'),
  /** Build Spec §7 puts "mark corrected" in the dashboard, so the actor is always a staff_user. */
  correctedBy: nullableFk('corrected_by').references(() => staffUser.id, { onDelete: 'set null' }),
}, (t) => [
  index('order_outlet_placed_idx').on(t.outletId, t.placedAt),
  index('order_customer_placed_idx').on(t.customerId, t.placedAt),
])

export const orderItem = pgTable('order_item', {
  id: id(),
  orderId: fk('order_id').references(() => order.id, { onDelete: 'cascade' }),
  /** Restricted: an item that has been ordered stays on the menu so reporting can join to it. */
  itemId: fk('item_id').references(() => menuItem.id, { onDelete: 'restrict' }),
  variantId: nullableFk('variant_id').references(() => itemVariant.id, { onDelete: 'restrict' }),
  options: jsonb('options').notNull().default([]),
  qty: integer('qty').notNull(),
  /** The price charged, including the variant delta. The menu price may since have changed. */
  unitPricePaise: integer('unit_price_paise').notNull(),
  /** A menu item can be renamed after the order; the receipt must show what the customer saw. */
  nameSnapshot: text('name_snapshot').notNull(),
}, (t) => [index('order_item_order_idx').on(t.orderId)])

/** The audit trail of the Build Spec §4 state machine: one row per transition, never updated. */
export const orderEvent = pgTable('order_event', {
  id: id(),
  orderId: fk('order_id').references(() => order.id, { onDelete: 'cascade' }),
  /** Null on the first event, where the order comes into existence at `received`. */
  fromStatus: orderStatus('from_status'),
  toStatus: orderStatus('to_status').notNull(),
  actorType: actorType('actor_type').notNull(),
  /** Polymorphic per `actor_type`, so no constraint. Null for `system` and `ai`. */
  actorId: nullableFk('actor_id'),
  at: utc('at').notNull().defaultNow(),
}, (t) => [index('order_event_order_idx').on(t.orderId)])

export const payment = pgTable('payment', {
  id: id(),
  orderId: fk('order_id').references(() => order.id, { onDelete: 'cascade' }),
  /** The adapter's name, not an enum: a second gateway must not need a migration. */
  gateway: text('gateway').notNull(),
  linkId: text('link_id'),
  paymentId: text('payment_id'),
  amountPaise: integer('amount_paise').notNull(),
  status: paymentStatus('status').notNull(),
  /** What the customer actually paid with, as the gateway reports it — "upi/gpay", "card". */
  methodDetail: text('method_detail'),
  /** Kept verbatim: a disputed payment is settled by what the gateway sent, not by our reading. */
  webhookPayload: jsonb('webhook_payload'),
  createdAt: createdAt(),
  paidAt: utc('paid_at'),
}, (t) => [index('payment_order_idx').on(t.orderId)])

export const orderRelations = relations(order, ({ one, many }) => ({
  restaurant: one(restaurant, { fields: [order.restaurantId], references: [restaurant.id] }),
  outlet: one(outlet, { fields: [order.outletId], references: [outlet.id] }),
  customer: one(customer, { fields: [order.customerId], references: [customer.id] }),
  address: one(customerAddress, { fields: [order.addressId], references: [customerAddress.id] }),
  items: many(orderItem),
  events: many(orderEvent),
  payments: many(payment),
}))

export const orderItemRelations = relations(orderItem, ({ one }) => ({
  order: one(order, { fields: [orderItem.orderId], references: [order.id] }),
  item: one(menuItem, { fields: [orderItem.itemId], references: [menuItem.id] }),
  variant: one(itemVariant, { fields: [orderItem.variantId], references: [itemVariant.id] }),
}))

export const orderEventRelations = relations(orderEvent, ({ one }) => ({
  order: one(order, { fields: [orderEvent.orderId], references: [order.id] }),
}))

export const paymentRelations = relations(payment, ({ one }) => ({
  order: one(order, { fields: [payment.orderId], references: [order.id] }),
}))
