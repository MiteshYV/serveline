import { and, desc, eq, isNull, sql } from 'drizzle-orm'
import { assertConsentForProfileWrite, type ConsentRecordView } from '../../core/consent.ts'
import { db } from '../client.ts'
import { consentRecord, customer, customerAddress, customerRestaurant } from '../schema/index.ts'
import { type Actor, type Executor, firstRow, writeAudit } from './ops.ts'

/**
 * The customer aggregate: identity, consent, per-restaurant profile, addresses.
 *
 * Two rules from CLAUDE.md hold on every function here and are not negotiable:
 *  - every write also writes `audit_log`, through `writeAudit`, in the same transaction;
 *  - nothing beyond the phone number is stored until a consent covering it exists
 *    (Build Spec §10), checked by core's `assertConsentForProfileWrite` against the live row.
 *
 * Audit snapshots never carry the phone number: `audit_log` is not one of the four tables
 * allowed to hold one, so `phone` is stripped and `phone_hash` stands in for it.
 */

type CustomerRow = typeof customer.$inferSelect
type ConsentInsert = typeof consentRecord.$inferInsert
type AddressInsert = typeof customerAddress.$inferInsert
type ProfileRow = typeof customerRestaurant.$inferSelect

/**
 * What the reorder shortcut (Build Spec §6, Ideation §6 "usual order") replays: the inputs that
 * built the last order, so it can be re-priced against today's menu, plus the names to show
 * while that happens.
 */
export type UsualOrder = {
  items: { itemId: string; variantId?: string; optionIds: string[]; qty: number; name: string }[]
}

const customerAudit = ({ phone: _phone, ...rest }: CustomerRow) => rest

/** By id — what a customer session cookie carries (src/auth/session.ts `subjectId`). */
export async function getCustomer(customerId: string): Promise<CustomerRow | null> {
  return (await db.query.customer.findFirst({ where: eq(customer.id, customerId) })) ?? null
}

export async function findCustomerByPhoneHash(phoneHash: string): Promise<CustomerRow | null> {
  return (await db.query.customer.findFirst({ where: eq(customer.phoneHash, phoneHash) })) ?? null
}

/**
 * Create the platform identity, or update it. Keyed on the hash; the unique index is on the
 * phone, and the two agree because the hash is a pure function of the number.
 *
 * `name` is a profile field beyond the phone number (Build Spec §10), so writing it needs a
 * consent — which is per restaurant, so `restaurantId` must come with it and the consent must
 * already be recorded. The bare identity (`{ phone, phoneHash }`) needs no consent: it has to
 * exist before a `consent_record` can point at it.
 *
 * `preferredLanguage` is exempt: it is the language the customer chose to read the notice in
 * (Build Spec §6, "hi, en, kn toggle"), chosen before consent and recorded on the consent itself.
 */
export async function upsertCustomer(
  input: {
    phone: string
    phoneHash: string
    name?: string
    preferredLanguage?: CustomerRow['preferredLanguage']
    restaurantId?: string
  },
  actor: Actor,
): Promise<CustomerRow> {
  return db.transaction(async (tx) => {
    const before = await tx.query.customer.findFirst({ where: eq(customer.phoneHash, input.phoneHash) })

    if (input.name !== undefined) {
      if (!before || !input.restaurantId) {
        throw new Error(
          'A name needs a consent, and consent is per restaurant: create the identity first, '
          + 'record the consent, then pass restaurantId with the name.',
        )
      }
      assertConsentForProfileWrite(await consentView(tx, before.id, input.restaurantId), 'order_fulfilment')
    }

    const row = firstRow(
      await tx
        .insert(customer)
        .values({
          phone: input.phone,
          phoneHash: input.phoneHash,
          name: input.name ?? null,
          preferredLanguage: input.preferredLanguage ?? null,
        })
        .onConflictDoUpdate({
          target: customer.phone,
          // A field not supplied this time keeps its stored value.
          set: {
            name: sql`coalesce(excluded.name, ${customer.name})`,
            preferredLanguage: sql`coalesce(excluded.preferred_language, ${customer.preferredLanguage})`,
          },
        })
        .returning(),
      'customer',
    )

    await writeAudit({
      actorType: actor.type,
      actorId: actor.id,
      action: before ? 'customer.update' : 'customer.create',
      entity: 'customer',
      entityId: row.id,
      before: before ? customerAudit(before) : null,
      after: customerAudit(row),
    }, tx)
    return row
  })
}

/** A grant is a new row every time (notice texts are versioned, never edited — CLAUDE.md). */
export async function recordConsent(
  input: Pick<
    ConsentInsert,
    'customerId' | 'restaurantId' | 'noticeVersion' | 'purposes' | 'channel' | 'language' | 'evidence'
  >,
  actor: Actor,
) {
  return db.transaction(async (tx) => {
    const row = firstRow(await tx.insert(consentRecord).values(input).returning(), 'consent_record')
    await writeAudit({
      actorType: actor.type,
      actorId: actor.id,
      action: 'consent.grant',
      entity: 'consent_record',
      entityId: row.id,
      before: null,
      after: row,
    }, tx)
    return row
  })
}

/** The latest grant that has not been withdrawn, or null. Core decides whether it is *valid*. */
export async function getConsent(customerId: string, restaurantId: string, exec: Executor = db) {
  return (
    (await exec.query.consentRecord.findFirst({
      where: and(
        eq(consentRecord.customerId, customerId),
        eq(consentRecord.restaurantId, restaurantId),
        isNull(consentRecord.withdrawnAt),
      ),
      orderBy: desc(consentRecord.grantedAt),
    })) ?? null
  )
}

/** The gate's input, built from the live row. `undefined` (not null) is what core expects for "none". */
async function consentView(
  exec: Executor,
  customerId: string,
  restaurantId: string,
): Promise<ConsentRecordView | undefined> {
  const row = await getConsent(customerId, restaurantId, exec)
  return row
    ? { noticeVersion: row.noticeVersion, purposes: row.purposes, withdrawnAt: row.withdrawnAt }
    : undefined
}

/**
 * Build Spec §10: one tap on the ordering page, one action on the dashboard. Every open grant
 * for the pair is closed, so a stray second grant cannot keep a withdrawn consent alive.
 * Returns how many were withdrawn — zero is an ordinary answer, not an error.
 */
export async function withdrawConsent(customerId: string, restaurantId: string, actor: Actor): Promise<number> {
  return db.transaction(async (tx) => {
    const rows = await tx
      .update(consentRecord)
      .set({ withdrawnAt: new Date() })
      .where(and(
        eq(consentRecord.customerId, customerId),
        eq(consentRecord.restaurantId, restaurantId),
        isNull(consentRecord.withdrawnAt),
      ))
      .returning()

    for (const row of rows) {
      await writeAudit({
        actorType: actor.type,
        actorId: actor.id,
        action: 'consent.withdraw',
        entity: 'consent_record',
        entityId: row.id,
        before: { withdrawnAt: null },
        after: { withdrawnAt: row.withdrawnAt },
      }, tx)
    }
    return rows.length
  })
}

/** Most recently used first (Build Spec §6, "saved addresses first"); never-used ones after, newest first. */
export async function listAddresses(customerId: string, restaurantId: string) {
  return db.query.customerAddress.findMany({
    where: and(eq(customerAddress.customerId, customerId), eq(customerAddress.restaurantId, restaurantId)),
    orderBy: [sql`${customerAddress.lastUsedAt} desc nulls last`, desc(customerAddress.createdAt)],
  })
}

/**
 * An address is the first profile field a delivery order stores beyond the phone, so this is
 * where Build Spec §10's consent rule bites hardest. The check reads the live consent row; a
 * caller cannot pass one in.
 */
export async function saveAddress(
  input: Omit<AddressInsert, 'id' | 'createdAt' | 'lastUsedAt'>,
  actor: Actor,
) {
  return db.transaction(async (tx) => {
    assertConsentForProfileWrite(await consentView(tx, input.customerId, input.restaurantId), 'order_fulfilment')

    const row = firstRow(await tx.insert(customerAddress).values(input).returning(), 'customer_address')
    await writeAudit({
      actorType: actor.type,
      actorId: actor.id,
      action: 'address.create',
      entity: 'customer_address',
      entityId: row.id,
      before: null,
      // Not the full address: the audit row outlives a DPDP erasure of the customer, and
      // CLAUDE.md forbids a full address anywhere it is not needed. Area and pincode locate
      // the write for an auditor without reproducing the door.
      after: {
        id: row.id,
        customerId: row.customerId,
        restaurantId: row.restaurantId,
        label: row.label,
        area: row.area,
        pincode: row.pincode,
        source: row.source,
        isConfirmed: row.isConfirmed,
      },
    }, tx)
    return row
  })
}

export async function getCustomerRestaurant(
  customerId: string,
  restaurantId: string,
  exec: Executor = db,
): Promise<ProfileRow | null> {
  return (
    (await exec.query.customerRestaurant.findFirst({
      where: and(
        eq(customerRestaurant.customerId, customerId),
        eq(customerRestaurant.restaurantId, restaurantId),
      ),
    })) ?? null
  )
}

/**
 * The per-restaurant profile. Creates it on first contact (a card scan, a table QR) and bumps
 * it on every later order in one statement, so two orders landing together both count.
 *
 * `source` and `firstChannel` are set once and never overwritten: they say how this customer
 * first arrived, which is what win-back attribution (Ideation §7) reads.
 *
 * Consent, per purpose in the notice (contracts/notices/README.md): the order statistics and
 * usual order are `order_history`; a staff note is part of fulfilling the order. The bare link
 * (source, first channel, consent id) needs none — it is the record of the consent itself.
 */
export async function upsertCustomerRestaurant(
  input: {
    customerId: string
    restaurantId: string
    source: ProfileRow['source']
    firstChannel?: ProfileRow['firstChannel']
    consentId?: string
    notes?: string
    /** The order just placed. `usualOrder` is the reorder shortcut and is replaced, not merged. */
    order?: { totalPaise: number; placedAt: Date; usualOrder: UsualOrder }
  },
  actor: Actor,
): Promise<ProfileRow> {
  return db.transaction(async (tx) => {
    if (input.order || input.notes !== undefined) {
      const view = await consentView(tx, input.customerId, input.restaurantId)
      if (input.order) assertConsentForProfileWrite(view, 'order_history')
      if (input.notes !== undefined) assertConsentForProfileWrite(view, 'order_fulfilment')
    }

    const before = await getCustomerRestaurant(input.customerId, input.restaurantId, tx)
    const bump = input.order

    const row = firstRow(
      await tx
        .insert(customerRestaurant)
        .values({
          customerId: input.customerId,
          restaurantId: input.restaurantId,
          source: input.source,
          firstChannel: input.firstChannel ?? null,
          consentId: input.consentId ?? null,
          notes: input.notes ?? null,
          orderCount: bump ? 1 : 0,
          ltvPaise: bump?.totalPaise ?? 0,
          lastOrderAt: bump?.placedAt ?? null,
          usualOrder: bump?.usualOrder ?? {},
        })
        .onConflictDoUpdate({
          target: [customerRestaurant.customerId, customerRestaurant.restaurantId],
          set: {
            firstChannel: sql`coalesce(${customerRestaurant.firstChannel}, excluded.first_channel)`,
            consentId: sql`coalesce(excluded.consent_id, ${customerRestaurant.consentId})`,
            notes: sql`coalesce(excluded.notes, ${customerRestaurant.notes})`,
            orderCount: sql`${customerRestaurant.orderCount} + excluded.order_count`,
            ltvPaise: sql`${customerRestaurant.ltvPaise} + excluded.ltv_paise`,
            lastOrderAt: sql`coalesce(excluded.last_order_at, ${customerRestaurant.lastOrderAt})`,
            usualOrder: bump ? sql`excluded.usual_order` : sql`${customerRestaurant.usualOrder}`,
          },
        })
        .returning(),
      'customer_restaurant',
    )

    await writeAudit({
      actorType: actor.type,
      actorId: actor.id,
      action: before ? 'customer_restaurant.update' : 'customer_restaurant.create',
      entity: 'customer_restaurant',
      // The table has a composite key and `audit_log.entity_id` is one uuid: the customer is the
      // subject of the write, and `after.restaurantId` carries the other half.
      entityId: row.customerId,
      before,
      after: row,
    }, tx)
    return row
  })
}
