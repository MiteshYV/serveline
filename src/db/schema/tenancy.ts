import { relations } from 'drizzle-orm'
import {
  boolean, date, index, integer, jsonb, numeric, pgTable, text, uniqueIndex, varchar,
} from 'drizzle-orm/pg-core'
import { createdAt, fk, id, utc } from './_shared.ts'
import { language, outletStatus, platformRole, restaurantStatus, staffRole } from './enums.ts'

export const restaurant = pgTable('restaurant', {
  id: id(),
  name: text('name').notNull(),
  slug: varchar('slug', { length: 64 }).notNull(),
  brandColour: varchar('brand_colour', { length: 7 }).notNull().default('#1F6F5C'),
  plan: text('plan').notNull().default('standard'),
  status: restaurantStatus('status').notNull().default('trialing'),
  trialStartedAt: utc('trial_started_at'),
  /** Ideation §10: trial is 30 days or 150 AI calls, whichever comes first. */
  trialCallLimit: integer('trial_call_limit').notNull().default(150),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('restaurant_slug_uq').on(t.slug)])

export const outlet = pgTable('outlet', {
  id: id(),
  restaurantId: fk('restaurant_id').references(() => restaurant.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  addressLine: text('address_line').notNull(),
  area: text('area').notNull(),
  pincode: varchar('pincode', { length: 6 }).notNull(),
  lat: numeric('lat', { precision: 9, scale: 6 }),
  lng: numeric('lng', { precision: 9, scale: 6 }),

  // The number printed on the packaging. Unconditional forwarding sends it to virtualNumber.
  displayPhone: varchar('display_phone', { length: 16 }),
  virtualNumber: varchar('virtual_number', { length: 16 }),
  forwardingVerifiedAt: utc('forwarding_verified_at'),
  /** Build Spec §5.1: the carrier dials this if the voice service does not answer in 3 s. */
  ownerMobile: varchar('owner_mobile', { length: 16 }),
  handoffNumber: varchar('handoff_number', { length: 16 }),

  hours: jsonb('hours').notNull().default({}),
  holidayDates: date('holiday_dates').array().notNull().default([]),
  deliveryRadiusKm: numeric('delivery_radius_km', { precision: 4, scale: 1 }).notNull().default('5.0'),
  serviceablePincodes: text('serviceable_pincodes').array().notNull().default([]),
  languages: language('languages').array().notNull().default(['hi', 'en', 'kn']),
  greetingOverride: text('greeting_override'),
  codEnabled: boolean('cod_enabled').notNull().default(true),
  status: outletStatus('status').notNull().default('active'),
  createdAt: createdAt(),
}, (t) => [index('outlet_restaurant_idx').on(t.restaurantId)])

export const staffUser = pgTable('staff_user', {
  id: id(),
  restaurantId: fk('restaurant_id').references(() => restaurant.id, { onDelete: 'cascade' }),
  /** One of only four tables permitted to hold a phone number. See CLAUDE.md. */
  phone: varchar('phone', { length: 16 }).notNull(),
  phoneHash: varchar('phone_hash', { length: 64 }).notNull(),
  name: text('name').notNull(),
  role: staffRole('role').notNull().default('staff'),
  lastLoginAt: utc('last_login_at'),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex('staff_user_restaurant_phone_uq').on(t.restaurantId, t.phone),
  index('staff_user_phone_hash_idx').on(t.phoneHash),
])

export const platformUser = pgTable('platform_user', {
  id: id(),
  phone: varchar('phone', { length: 16 }).notNull(),
  phoneHash: varchar('phone_hash', { length: 64 }).notNull(),
  name: text('name').notNull(),
  role: platformRole('role').notNull().default('agent'),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('platform_user_phone_uq').on(t.phone)])

export const restaurantRelations = relations(restaurant, ({ many }) => ({
  outlets: many(outlet),
  staff: many(staffUser),
}))

export const outletRelations = relations(outlet, ({ one }) => ({
  restaurant: one(restaurant, { fields: [outlet.restaurantId], references: [restaurant.id] }),
}))
