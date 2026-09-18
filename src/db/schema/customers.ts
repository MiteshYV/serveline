import { relations } from 'drizzle-orm'
import {
  boolean, index, integer, jsonb, numeric, pgTable, primaryKey, text, uniqueIndex, varchar,
} from 'drizzle-orm/pg-core'
import { createdAt, fk, id, nullableFk, utc } from './_shared.ts'
import { addressSource, consentChannel, customerSource, language, orderChannel } from './enums.ts'
import { restaurant } from './tenancy.ts'

/**
 * Build Spec §4: the platform identity — one phone, one row. Everything a restaurant knows about
 * this person hangs off `customer_restaurant`, and nothing crosses restaurants without a fresh
 * consent. That separation is the product's positioning (Ideation §1), not a schema preference.
 */
export const customer = pgTable('customer', {
  id: id(),
  /** One of only four tables permitted to hold a phone number. See CLAUDE.md. */
  phone: varchar('phone', { length: 16 }).notNull(),
  phoneHash: varchar('phone_hash', { length: 64 }).notNull(),
  /** Build Spec §10: nothing beyond the phone number is stored until a consent exists. */
  name: text('name'),
  preferredLanguage: language('preferred_language'),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex('customer_phone_uq').on(t.phone),
  // Build Spec §4 names this index: analytics and joins read the hash, never the number.
  index('customer_phone_hash_idx').on(t.phoneHash),
])

/**
 * Build Spec §10: consent per customer per restaurant, with notice version, purposes, channel,
 * language and timestamp. A row is evidence — withdrawal sets `withdrawn_at` and a re-grant is a
 * new row, because notice texts are versioned and never edited in place (CLAUDE.md).
 */
export const consentRecord = pgTable('consent_record', {
  id: id(),
  customerId: fk('customer_id').references(() => customer.id, { onDelete: 'cascade' }),
  restaurantId: fk('restaurant_id').references(() => restaurant.id, { onDelete: 'cascade' }),
  noticeVersion: varchar('notice_version', { length: 32 }).notNull(),
  purposes: text('purposes').array().notNull().default([]),
  channel: consentChannel('channel').notNull(),
  language: language('language').notNull(),
  grantedAt: utc('granted_at').notNull().defaultNow(),
  withdrawnAt: utc('withdrawn_at'),
  /** Build Spec §4: the call id or request id, and the IP. Never a phone number. */
  evidence: jsonb('evidence').notNull().default({}),
}, (t) => [index('consent_record_customer_restaurant_idx').on(t.customerId, t.restaurantId)])

/**
 * Build Spec §4: the per-restaurant profile. Keyed on the pair, because a customer is only ever
 * known to a restaurant in the context of the consent they gave that restaurant.
 */
export const customerRestaurant = pgTable('customer_restaurant', {
  customerId: fk('customer_id').references(() => customer.id, { onDelete: 'cascade' }),
  restaurantId: fk('restaurant_id').references(() => restaurant.id, { onDelete: 'cascade' }),
  source: customerSource('source').notNull(),
  /** Nullable: a win-back card scan creates the profile before there is any order. */
  firstChannel: orderChannel('first_channel'),
  /**
   * Set null rather than cascade — a consent record is evidence and outlives the profile's
   * pointer to it. Erasure (Build Spec §10) deletes the customer, which takes both.
   */
  consentId: nullableFk('consent_id').references(() => consentRecord.id, { onDelete: 'set null' }),
  orderCount: integer('order_count').notNull().default(0),
  lastOrderAt: utc('last_order_at'),
  ltvPaise: integer('ltv_paise').notNull().default(0),
  /** The reorder shortcut on the ordering page, and the AI's opening suggestion at M2. */
  usualOrder: jsonb('usual_order').notNull().default({}),
  notes: text('notes'),
}, (t) => [
  primaryKey({ columns: [t.customerId, t.restaurantId] }),
  // The primary key leads with customer_id, so the dashboard's restaurant-scoped customer
  // lists would have no index at all without this one.
  index('customer_restaurant_restaurant_idx').on(t.restaurantId),
])

/**
 * Build Spec §4. `voice_rough` is where an address captured over a call lands at M2 —
 * unconfirmed, and often a landmark rather than a line — until the address link confirms it.
 * The column exists now so that M2 needs no enum or table migration.
 */
export const customerAddress = pgTable('customer_address', {
  id: id(),
  customerId: fk('customer_id').references(() => customer.id, { onDelete: 'cascade' }),
  restaurantId: fk('restaurant_id').references(() => restaurant.id, { onDelete: 'cascade' }),
  label: text('label'),
  line1: text('line1').notNull(),
  landmark: text('landmark'),
  area: text('area'),
  /** Nullable, unlike `outlet.pincode`: a rough voice address often arrives without one. */
  pincode: varchar('pincode', { length: 6 }),
  lat: numeric('lat', { precision: 9, scale: 6 }),
  lng: numeric('lng', { precision: 9, scale: 6 }),
  source: addressSource('source').notNull(),
  isConfirmed: boolean('is_confirmed').notNull().default(false),
  lastUsedAt: utc('last_used_at'),
  createdAt: createdAt(),
}, (t) => [index('customer_address_customer_restaurant_idx').on(t.customerId, t.restaurantId)])

/** Build Spec §4: dietary and allergy facts, held by the restaurant that was told them. */
export const customerPreference = pgTable('customer_preference', {
  customerId: fk('customer_id').references(() => customer.id, { onDelete: 'cascade' }),
  restaurantId: fk('restaurant_id').references(() => restaurant.id, { onDelete: 'cascade' }),
  dietary: text('dietary').array().notNull().default([]),
  allergies: text('allergies').array().notNull().default([]),
  notes: text('notes'),
}, (t) => [primaryKey({ columns: [t.customerId, t.restaurantId] })])

export const customerRelations = relations(customer, ({ many }) => ({
  restaurants: many(customerRestaurant),
  consents: many(consentRecord),
  addresses: many(customerAddress),
  preferences: many(customerPreference),
}))

export const customerRestaurantRelations = relations(customerRestaurant, ({ one }) => ({
  customer: one(customer, {
    fields: [customerRestaurant.customerId], references: [customer.id],
  }),
  restaurant: one(restaurant, {
    fields: [customerRestaurant.restaurantId], references: [restaurant.id],
  }),
  consent: one(consentRecord, {
    fields: [customerRestaurant.consentId], references: [consentRecord.id],
  }),
}))

export const consentRecordRelations = relations(consentRecord, ({ one }) => ({
  customer: one(customer, { fields: [consentRecord.customerId], references: [customer.id] }),
  restaurant: one(restaurant, {
    fields: [consentRecord.restaurantId], references: [restaurant.id],
  }),
}))

export const customerAddressRelations = relations(customerAddress, ({ one }) => ({
  customer: one(customer, { fields: [customerAddress.customerId], references: [customer.id] }),
  restaurant: one(restaurant, {
    fields: [customerAddress.restaurantId], references: [restaurant.id],
  }),
}))

export const customerPreferenceRelations = relations(customerPreference, ({ one }) => ({
  customer: one(customer, { fields: [customerPreference.customerId], references: [customer.id] }),
  restaurant: one(restaurant, {
    fields: [customerPreference.restaurantId], references: [restaurant.id],
  }),
}))
