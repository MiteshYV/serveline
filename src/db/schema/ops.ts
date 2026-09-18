import { relations } from 'drizzle-orm'
import {
  date, index, integer, jsonb, pgTable, text, uniqueIndex, uuid, varchar,
} from 'drizzle-orm/pg-core'
import { fk, id, utc } from './_shared.ts'
import { actorType, smsKind, smsStatus } from './enums.ts'
import { outlet, restaurant } from './tenancy.ts'

export const smsMessage = pgTable('sms_message', {
  id: id(),
  restaurantId: fk('restaurant_id').references(() => restaurant.id, { onDelete: 'cascade' }),
  /** The hash, never the number. Only four tables may hold a phone number and this is not one of them. */
  toPhoneHash: varchar('to_phone_hash', { length: 64 }).notNull(),
  kind: smsKind('kind').notNull(),
  /** Null until DLT approval lands — that is a two-to-four week external dependency (Ideation §8). */
  dltTemplateId: varchar('dlt_template_id', { length: 32 }),
  provider: text('provider').notNull(),
  /** Assigned when the provider accepts the message, so null while queued and after a failure. */
  providerMessageId: text('provider_message_id'),
  status: smsStatus('status').notNull().default('queued'),
  /** Build Spec §9: cost is logged per message, because it lands in the per-call cost roll-up. */
  costPaise: integer('cost_paise').notNull().default(0),
  sentAt: utc('sent_at'),
}, (t) => [index('sms_message_restaurant_idx').on(t.restaurantId)])

/**
 * Aggregator orders for one outlet for one week, typed in by hand.
 *
 * ServeLine sees its own orders and nothing else, so this table is the denominator of Direct Order
 * Share, the North Star (Ideation §9). Without it the metric cannot be computed at all, which is
 * why a manual data-entry table earns its place: a North Star that cannot be measured is a slogan.
 * Phase 2 replaces the typing with a POS or middleware pull.
 */
export const externalOrderCount = pgTable('external_order_count', {
  id: id(),
  outletId: fk('outlet_id').references(() => outlet.id, { onDelete: 'cascade' }),
  /** The Monday of the week being reported; the dashboard asks each Monday for the week just ended. */
  weekStart: date('week_start').notNull(),
  swiggyOrders: integer('swiggy_orders').notNull().default(0),
  zomatoOrders: integer('zomato_orders').notNull().default(0),
  otherOrders: integer('other_orders').notNull().default(0),
  /** Either a staff_user or a platform_user: the owner or the agent may enter these (Ideation §9). */
  enteredBy: uuid('entered_by').notNull(),
  enteredAt: utc('entered_at').notNull().defaultNow(),
}, (t) => [
  /** Build Spec §4 names this unique. It is also what makes the Monday prompt idempotent. */
  uniqueIndex('external_order_count_outlet_week_uq').on(t.outletId, t.weekStart),
])

/** Every write to customer data lands here, from the repository layer rather than call sites (CLAUDE.md). */
export const auditLog = pgTable('audit_log', {
  id: id(),
  actorType: actorType('actor_type').notNull(),
  /** Polymorphic over staff_user, platform_user and customer, and null for `system` — hence no foreign key. */
  actorId: uuid('actor_id'),
  action: text('action').notNull(),
  entity: text('entity').notNull(),
  entityId: uuid('entity_id').notNull(),
  /** Null on an insert, as `after` is null on a delete — DPDP erasure is a real delete (Build Spec §10). */
  before: jsonb('before'),
  after: jsonb('after'),
  at: utc('at').notNull().defaultNow(),
}, (t) => [index('audit_log_entity_idx').on(t.entity, t.entityId)])

export const smsMessageRelations = relations(smsMessage, ({ one }) => ({
  restaurant: one(restaurant, { fields: [smsMessage.restaurantId], references: [restaurant.id] }),
}))

export const externalOrderCountRelations = relations(externalOrderCount, ({ one }) => ({
  outlet: one(outlet, { fields: [externalOrderCount.outletId], references: [outlet.id] }),
}))
