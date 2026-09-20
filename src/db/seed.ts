import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { phonePepper } from '../auth/secrets.ts'
import { priceCart, type CartItemInput, type PricedMenuItem } from '../core/cart.ts'
import { NOTICE_PURPOSES, NOTICE_VERSION } from '../core/consent.ts'
import { paise } from '../core/money.ts'
import { assertTransition, type Fulfilment, type OrderStatus } from '../core/orders.ts'
import { hashPhone } from '../core/phone.ts'
import type { Db } from './client.ts'
import * as s from './schema/index.ts'

/**
 * `npm run db:seed` — one fictional Bangalore restaurant, so the product runs end to end on a
 * laptop with no vendor account (M1 design, "Build mode").
 *
 * KADAMBA TIFFIN ROOM IS FICTIONAL. The name, the people, the addresses and the phone numbers are
 * invented; any resemblance to a real business is coincidence. Every phone number is shaped
 * +9199000000NN so it can never be a real subscriber's.
 *
 * Rows go straight through Drizzle — this is data, not a code path; the routes use the repository
 * layer. Two rules from that layer are kept anyway, because a seed that breaks them would teach
 * the wrong thing: every customer-data row gets an audit_log row (CLAUDE.md), and no phone number
 * lands outside the four tables allowed to hold one — audit snapshots carry the hash instead.
 *
 * Idempotent: if the `demo` slug exists nothing is touched and the process exits 0.
 *
 * Dish names are English only, as printed on a Bangalore menu. Hindi and Kannada spoken aliases
 * arrive with `menu_vocabulary` at M4 (Build Spec §4); the UI chrome is trilingual from M1.
 */

const SLUG = 'demo'

const PHONE = {
  owner: '+919900000001',
  staff: '+919900000002',
  agent: '+919900000003',
  admin: '+919900000004',
  priya: '+919900000005', // returning customer
  arjun: '+919900000006', // win-back card customer
  divya: '+919900000007', // delivered this evening
  tableSeven: '+919900000008', // phone only, no consent
  handoff: '+919900000009', // phone only, no consent
  display: '+919900000010', // the number printed on the packaging
} as const

type MenuSpec = {
  category: string
  name: string
  description: string
  pricePaise: number
  isVeg: boolean
  spiceLevel?: 'mild' | 'medium' | 'hot'
  allergens?: string[]
  tags?: string[]
  /** [name, delta]. Base price is the full plate; a half plate is a negative delta (schema note). */
  variants?: [string, number][]
  optionGroup?: { name: string; minSelect: number; maxSelect: number; options: [string, number][] }
}

const CATEGORIES = ['South Indian Tiffin', 'North Indian Mains', 'Breads', 'Rice & Biryani', 'Beverages']

// Prices are what a Koramangala tiffin room charges in 2026, in paise.
const MENU: MenuSpec[] = [
  { category: 'South Indian Tiffin', name: 'Idli Vada', description: 'Two soft idlis and a medu vada, with sambar and chutney', pricePaise: 7000, isVeg: true, tags: ['breakfast'] },
  { category: 'South Indian Tiffin', name: 'Masala Dosa', description: 'Crisp dosa with potato palya, sambar and two chutneys', pricePaise: 9000, isVeg: true, tags: ['breakfast'],
    optionGroup: { name: 'Extras', minSelect: 0, maxSelect: 2, options: [['Extra ghee', 1500], ['Extra chutney', 1000]] } },
  { category: 'South Indian Tiffin', name: 'Set Dosa', description: 'Three spongy dosas with vegetable sagu', pricePaise: 8000, isVeg: true, tags: ['breakfast'] },
  { category: 'South Indian Tiffin', name: 'Rava Idli', description: 'Two rava idlis with sambar and coconut chutney', pricePaise: 7500, isVeg: true, tags: ['breakfast'] },
  { category: 'South Indian Tiffin', name: 'Bisi Bele Bath', description: 'Rice and toor dal cooked with vegetables and the house masala, topped with boondi', pricePaise: 9500, isVeg: true, spiceLevel: 'medium' },
  { category: 'South Indian Tiffin', name: 'Khara Bath', description: 'Semolina upma with vegetables and a squeeze of lime', pricePaise: 6000, isVeg: true, spiceLevel: 'mild', tags: ['breakfast'] },
  { category: 'South Indian Tiffin', name: 'Chow Chow Bath', description: 'Khara bath and kesari bath on one plate', pricePaise: 9500, isVeg: true, tags: ['breakfast'] },
  { category: 'South Indian Tiffin', name: 'Medu Vada', description: 'Two crisp urad dal vadas with sambar and chutney', pricePaise: 5000, isVeg: true },

  { category: 'North Indian Mains', name: 'Paneer Butter Masala', description: 'Paneer in a tomato, butter and cashew gravy', pricePaise: 24000, isVeg: true, spiceLevel: 'mild', allergens: ['dairy', 'nuts'],
    variants: [['Half', -9000], ['Full', 0]] },
  { category: 'North Indian Mains', name: 'Dal Tadka', description: 'Yellow dal tempered with garlic, cumin and dried chilli', pricePaise: 16000, isVeg: true, spiceLevel: 'mild',
    variants: [['Half', -6000], ['Full', 0]] },
  { category: 'North Indian Mains', name: 'Mixed Veg Kurma', description: 'Seasonal vegetables in a coconut and cashew gravy', pricePaise: 17000, isVeg: true, spiceLevel: 'medium', allergens: ['nuts'] },
  { category: 'North Indian Mains', name: 'Chicken Curry', description: 'Home-style chicken curry with onion and whole spices', pricePaise: 26000, isVeg: false, spiceLevel: 'hot',
    variants: [['Half', -10000], ['Full', 0]] },
  { category: 'North Indian Mains', name: 'Chicken Tikka Masala', description: 'Tandoor-grilled chicken in a creamy tomato gravy', pricePaise: 28000, isVeg: false, spiceLevel: 'medium', allergens: ['dairy'] },

  { category: 'Breads', name: 'Butter Naan', description: '', pricePaise: 4500, isVeg: true, allergens: ['gluten', 'dairy'] },
  { category: 'Breads', name: 'Tandoori Roti', description: '', pricePaise: 2500, isVeg: true, allergens: ['gluten'] },
  { category: 'Breads', name: 'Kerala Parotta (2 pcs)', description: 'Flaky layered parotta', pricePaise: 6000, isVeg: true, allergens: ['gluten'] },

  { category: 'Rice & Biryani', name: 'Chicken Donne Biryani', description: 'Bangalore-style seeraga samba rice biryani, served in a leaf donne', pricePaise: 23000, isVeg: false, spiceLevel: 'medium',
    optionGroup: { name: 'Served with', minSelect: 1, maxSelect: 1, options: [['Raita', 0], ['Salan', 0]] } },
  { category: 'Rice & Biryani', name: 'Mutton Biryani', description: 'Slow-cooked mutton dum biryani', pricePaise: 32000, isVeg: false, spiceLevel: 'medium' },
  { category: 'Rice & Biryani', name: 'Veg Biryani', description: 'Basmati biryani with seasonal vegetables and mint', pricePaise: 18000, isVeg: true, spiceLevel: 'medium' },
  { category: 'Rice & Biryani', name: 'Curd Rice', description: 'With pomegranate and a mustard tempering', pricePaise: 8000, isVeg: true, allergens: ['dairy'] },

  { category: 'Beverages', name: 'Filter Coffee', description: 'Strong, in a steel tumbler', pricePaise: 3000, isVeg: true, allergens: ['dairy'],
    variants: [['Regular', 0], ['Large', 1500]] },
  { category: 'Beverages', name: 'Masala Chai', description: '', pricePaise: 2500, isVeg: true, allergens: ['dairy'] },
  { category: 'Beverages', name: 'Badam Milk', description: 'Warm, with saffron', pricePaise: 5000, isVeg: true, allergens: ['dairy', 'nuts'] },
  { category: 'Beverages', name: 'Buttermilk (Majjige)', description: 'Spiced, with curry leaves', pricePaise: 3000, isVeg: true, allergens: ['dairy'] },
]

function must<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`seed: missing ${what}`)
  return value
}

type Actor = { type: 'customer' | 'staff' | 'system'; id: string | null }
type Step = { to: OrderStatus; minutesAgo: number; by: Actor }

export async function seed(db: Db): Promise<'seeded' | 'already_seeded'> {
  const existing = await db.select({ id: s.restaurant.id }).from(s.restaurant).where(eq(s.restaurant.slug, SLUG))
  if (existing.length > 0) {
    console.log(`seed: restaurant "${SLUG}" already exists; nothing to do`)
    return 'already_seeded'
  }

  const pepper = phonePepper()
  const hash = (e164: string) => hashPhone(e164, pepper)

  const now = new Date()
  const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000)
  const daysAgo = (d: number) => minutesAgo(d * 24 * 60)

  // The Monday nag (Build Spec §7, design §7.8) asks for the week just ended, and the app renders
  // Asia/Kolkata, so weeks are cut on IST Mondays. `monday(1)` is the week the nag will ask for;
  // it is deliberately absent below. `monday(2)` and `monday(3)` are entered so "Direct Order Share
  // versus last month" has a denominator.
  const IST_OFFSET_MS = 330 * 60_000
  const istNow = new Date(now.getTime() + IST_OFFSET_MS)
  const sinceMonday = (istNow.getUTCDay() + 6) % 7
  const thisMondayMs = Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate() - sinceMonday)
  const monday = (weeksAgo: number) => new Date(thisMondayMs - weeksAgo * 7 * 86_400_000)
  const dateOnly = (d: Date) => d.toISOString().slice(0, 10)

  const purposes = must(NOTICE_PURPOSES[NOTICE_VERSION], `purposes for notice ${NOTICE_VERSION}`)

  const summary = await db.transaction(async (tx) => {
    // ---- tenancy ---------------------------------------------------------------------------
    const restaurant = must((await tx.insert(s.restaurant).values({
      name: 'Kadamba Tiffin Room',
      slug: SLUG,
      brandColour: '#1F7A6A', // mid teal-green; the UI normalises it (design §3.5), never uses it raw
      status: 'trialing',
      trialStartedAt: now,
    }).returning())[0], 'restaurant row')

    const outlet = must((await tx.insert(s.outlet).values({
      restaurantId: restaurant.id,
      name: 'Koramangala',
      addressLine: 'No. 214, 80 Feet Road, 5th Block',
      area: 'Koramangala',
      pincode: '560095',
      lat: '12.934500',
      lng: '77.624600',
      displayPhone: PHONE.display,
      ownerMobile: PHONE.owner,
      handoffNumber: PHONE.owner,
      // ponytail: the Build Spec gives `hours` no shape. Simplest reading: weekday → [open, close]
      // pairs in Asia/Kolkata wall-clock, an empty list meaning closed. The settings page (§7) and
      // the M2 greeting both read it; if either needs more (e.g. delivery-only hours) it becomes
      // {dineIn, delivery} per day and this seed changes with it.
      hours: {
        mon: [['07:00', '15:30'], ['18:30', '22:30']],
        tue: [['07:00', '15:30'], ['18:30', '22:30']],
        wed: [['07:00', '15:30'], ['18:30', '22:30']],
        thu: [['07:00', '15:30'], ['18:30', '22:30']],
        fri: [['07:00', '15:30'], ['18:30', '22:30']],
        sat: [['07:00', '22:30']],
        sun: [['07:00', '22:30']],
      },
      holidayDates: [`${now.getUTCFullYear()}-11-08`], // Deepavali
      deliveryRadiusKm: '4.0',
      serviceablePincodes: ['560034', '560095', '560047', '560030'],
      codEnabled: true,
    }).returning())[0], 'outlet row')

    const owner = must((await tx.insert(s.staffUser).values({
      restaurantId: restaurant.id, phone: PHONE.owner, phoneHash: hash(PHONE.owner), name: 'Ramesh Gowda', role: 'owner',
    }).returning())[0], 'owner row')
    const staff = must((await tx.insert(s.staffUser).values({
      restaurantId: restaurant.id, phone: PHONE.staff, phoneHash: hash(PHONE.staff), name: 'Manjunath', role: 'staff',
    }).returning())[0], 'staff row')
    await tx.insert(s.platformUser).values([
      { phone: PHONE.agent, phoneHash: hash(PHONE.agent), name: 'Ananya Rao', role: 'agent' },
      { phone: PHONE.admin, phoneHash: hash(PHONE.admin), name: 'Rahul Nair', role: 'admin' },
    ])

    // ---- menu ------------------------------------------------------------------------------
    const menu = must((await tx.insert(s.menu).values({
      outletId: outlet.id, version: 1, publishedAt: daysAgo(10), publishedBy: owner.id,
    }).returning())[0], 'menu row')

    const categoryRows = await tx.insert(s.menuCategory).values(
      CATEGORIES.map((name, sort) => ({ menuId: menu.id, name, sort })),
    ).returning()
    const categoryId = new Map(categoryRows.map((c) => [c.name, c.id]))

    const itemRows = await tx.insert(s.menuItem).values(MENU.map((it, sort): typeof s.menuItem.$inferInsert => ({
      menuId: menu.id,
      categoryId: must(categoryId.get(it.category), `category ${it.category}`),
      name: it.name,
      description: it.description || null,
      pricePaise: it.pricePaise,
      isVeg: it.isVeg,
      spiceLevel: it.spiceLevel ?? 'none',
      allergens: it.allergens ?? [],
      tags: it.tags ?? [],
      sort,
    }))).returning()
    const itemId = new Map(itemRows.map((r) => [r.name, r.id]))

    const variantRows = await tx.insert(s.itemVariant).values(MENU.flatMap((it) =>
      (it.variants ?? []).map(([name, priceDeltaPaise]) => ({
        itemId: must(itemId.get(it.name), it.name), name, priceDeltaPaise,
      })),
    )).returning()

    const groupRows: (typeof s.itemOptionGroup.$inferSelect)[] = []
    const optionRows: (typeof s.itemOption.$inferSelect)[] = []
    for (const it of MENU) {
      if (!it.optionGroup) continue
      const group = must((await tx.insert(s.itemOptionGroup).values({
        itemId: must(itemId.get(it.name), it.name),
        name: it.optionGroup.name,
        minSelect: it.optionGroup.minSelect,
        maxSelect: it.optionGroup.maxSelect,
      }).returning())[0], 'option group row')
      groupRows.push(group)
      optionRows.push(...await tx.insert(s.itemOption).values(
        it.optionGroup.options.map(([name, priceDeltaPaise]) => ({ groupId: group.id, name, priceDeltaPaise })),
      ).returning())
    }

    // The menu as core sees it, so the demo orders are priced by the same function the ordering
    // page and the M2 voice tools use. Nothing below computes a rupee figure by hand.
    const priced: PricedMenuItem[] = itemRows.map((row) => ({
      id: row.id,
      name: row.name,
      pricePaise: paise(row.pricePaise),
      variants: variantRows.filter((v) => v.itemId === row.id)
        .map((v) => ({ id: v.id, name: v.name, priceDeltaPaise: paise(v.priceDeltaPaise) })),
      optionGroups: groupRows.filter((g) => g.itemId === row.id).map((g) => ({
        id: g.id, name: g.name, minSelect: g.minSelect, maxSelect: g.maxSelect,
        options: optionRows.filter((o) => o.groupId === g.id)
          .map((o) => ({ id: o.id, name: o.name, priceDeltaPaise: paise(o.priceDeltaPaise) })),
      })),
    }))
    const pricedByName = new Map(priced.map((p) => [p.name, p]))
    const optionById = new Map(priced.flatMap((p) => p.optionGroups.flatMap((g) => g.options)).map((o) => [o.id, o]))

    /** A cart line by the names a person reads on the menu; ids are resolved from this seed's rows. */
    const line = (item: string, qty: number, pick: { variant?: string; options?: string[] } = {}): CartItemInput => {
      const it = must(pricedByName.get(item), `menu item "${item}"`)
      return {
        itemId: it.id,
        variantId: pick.variant === undefined
          ? undefined
          : must(it.variants.find((v) => v.name === pick.variant), `variant "${pick.variant}" on ${item}`).id,
        optionIds: (pick.options ?? []).map((name) =>
          must(it.optionGroups.flatMap((g) => g.options).find((o) => o.name === name), `option "${name}" on ${item}`).id,
        ),
        qty,
      }
    }

    // ---- win-back cards and codes ----------------------------------------------------------
    const batchOne = must((await tx.insert(s.cardBatch).values({
      restaurantId: restaurant.id, outletId: outlet.id, qty: 200, printedAt: daysAgo(9), placedAt: daysAgo(7),
    }).returning())[0], 'batch one')
    // Printed, not yet in the packaging: gives the agent console a placement to chase.
    const batchTwo = must((await tx.insert(s.cardBatch).values({
      restaurantId: restaurant.id, outletId: outlet.id, qty: 100, printedAt: daysAgo(2), placedAt: null,
    }).returning())[0], 'batch two')

    const year = now.getUTCFullYear()
    const validity = { validFrom: new Date(Date.UTC(year, 0, 1)), validTo: new Date(Date.UTC(year, 11, 31, 23, 59, 59)) }
    const codeRows = await tx.insert(s.discountCode).values([
      { restaurantId: restaurant.id, code: 'WELCOME10', kind: 'win_back_card', percent: 10, batchId: batchOne.id, ...validity },
      // A second batch's code: the per-restaurant rule (src/core/codes.ts, code_redemption's partial
      // unique index) refuses it to anyone who has already redeemed WELCOME10.
      { restaurantId: restaurant.id, code: 'WELCOME10B', kind: 'win_back_card', percent: 10, batchId: batchTwo.id, ...validity },
    ]).returning()
    const welcome10 = must(codeRows.find((c) => c.code === 'WELCOME10'), 'WELCOME10')

    // ---- customers -------------------------------------------------------------------------
    // audit_log.after never carries the phone: the number lives on `customer` alone (CLAUDE.md),
    // and the hash is what an audit reader joins on.
    const audit = (actorId: string | null, entity: string, entityId: string, after: Record<string, unknown>) =>
      tx.insert(s.auditLog).values({ actorType: 'customer', actorId, action: 'insert', entity, entityId, before: null, after })

    /** The phone number and nothing else — no consent exists, so no other field may (Build Spec §10). */
    const addPhoneOnly = async (phone: string) => {
      const row = must((await tx.insert(s.customer).values({ phone, phoneHash: hash(phone) }).returning())[0], 'customer row')
      await audit(row.id, 'customer', row.id, { id: row.id, phoneHash: row.phoneHash, createdAt: row.createdAt })
      return row
    }

    /** Phone, then consent, then the fields the consent permits — in that order, as the page does it. */
    const addProfile = async (p: {
      phone: string; name: string; language: 'hi' | 'en' | 'kn'; joinedDaysAgo: number
      address: { label: string; line1: string; landmark: string; pincode: string }
    }) => {
      const grantedAt = daysAgo(p.joinedDaysAgo)
      const customer = must((await tx.insert(s.customer).values({
        phone: p.phone, phoneHash: hash(p.phone), name: p.name, preferredLanguage: p.language, createdAt: grantedAt,
      }).returning())[0], 'customer row')
      await audit(customer.id, 'customer', customer.id, {
        id: customer.id, phoneHash: customer.phoneHash, name: customer.name, preferredLanguage: customer.preferredLanguage, createdAt: grantedAt,
      })

      // One checkbox on the page grants every purpose the v1 notice describes (Build Spec §6).
      const consent = must((await tx.insert(s.consentRecord).values({
        customerId: customer.id, restaurantId: restaurant.id, noticeVersion: NOTICE_VERSION, purposes: [...purposes],
        channel: 'page', language: p.language, grantedAt, evidence: { requestId: `seed-${randomUUID()}`, ip: '127.0.0.1' },
      }).returning())[0], 'consent row')
      await audit(customer.id, 'consent_record', consent.id, consent)

      const address = must((await tx.insert(s.customerAddress).values({
        customerId: customer.id, restaurantId: restaurant.id, label: p.address.label, line1: p.address.line1,
        landmark: p.address.landmark, area: 'Koramangala', pincode: p.address.pincode, source: 'page', isConfirmed: true,
        lastUsedAt: grantedAt, createdAt: grantedAt,
      }).returning())[0], 'address row')
      // The projection saveAddress audits, not the row: the door (line1, landmark) never enters
      // audit_log (CLAUDE.md), and the admin audit page renders `after` as it is.
      await audit(customer.id, 'customer_address', address.id, {
        id: address.id, customerId: address.customerId, restaurantId: address.restaurantId, label: address.label,
        area: address.area, pincode: address.pincode, source: address.source, isConfirmed: address.isConfirmed,
      })

      return { customer, consent, address }
    }

    const priya = await addProfile({
      phone: PHONE.priya, name: 'Priya Raghavan', language: 'kn', joinedDaysAgo: 45,
      address: { label: 'Home', line1: 'Flat 302, Sai Krupa Apartments, 6th Cross, 4th Block', landmark: 'Opposite the Ganesha temple', pincode: '560034' },
    })
    const arjun = await addProfile({
      phone: PHONE.arjun, name: 'Arjun Mehta', language: 'en', joinedDaysAgo: 0,
      address: { label: 'Home', line1: 'No. 18, 1st Main, ST Bed Layout', landmark: 'Behind the water tank', pincode: '560047' },
    })
    const divya = await addProfile({
      phone: PHONE.divya, name: 'Divya Hegde', language: 'en', joinedDaysAgo: 12,
      address: { label: 'Office', line1: '3rd Floor, No. 42, 5th Cross, 3rd Block', landmark: 'Above the pharmacy', pincode: '560034' },
    })
    const tableSeven = await addPhoneOnly(PHONE.tableSeven)
    const handoff = await addPhoneOnly(PHONE.handoff)

    // ---- orders ----------------------------------------------------------------------------
    const byStaff: Actor = { type: 'staff', id: staff.id }
    const byOwner: Actor = { type: 'staff', id: owner.id }
    const system: Actor = { type: 'system', id: null }
    const byCustomer = (id: string | null): Actor => ({ type: 'customer', id })

    const placeOrder = async (spec: {
      channel: 'page_table' | 'page_delivery' | 'staff_manual'
      fulfilment: Fulfilment
      tableNo?: string
      customerId: string | null
      addressId?: string
      addressStatus?: 'na' | 'pending' | 'confirmed'
      paymentMethod: 'upi_link' | 'cod' | 'pay_at_table'
      code?: { id: string; percent: number }
      lines: CartItemInput[]
      placedMinutesAgo: number
      placedBy: Actor
      trail: Step[]
      notes?: string
    }) => {
      const cart = priceCart(spec.lines, priced, spec.code)
      const placedAt = minutesAgo(spec.placedMinutesAgo)

      // Every trail is checked against the core state machine, so the board can never be shown
      // a history the product could not have produced.
      const events: (typeof s.orderEvent.$inferInsert)[] = []
      let status: OrderStatus = 'received'
      for (const step of spec.trail) {
        assertTransition(status, step.to, spec.fulfilment)
        events.push({ orderId: '', fromStatus: status, toStatus: step.to, actorType: step.by.type, actorId: step.by.id, at: minutesAgo(step.minutesAgo) })
        status = step.to
      }
      const reached = (to: OrderStatus) => {
        const step = spec.trail.find((x) => x.to === to)
        return step ? minutesAgo(step.minutesAgo) : null
      }
      const confirmedAt = reached('confirmed')

      const order = must((await tx.insert(s.order).values({
        restaurantId: restaurant.id,
        outletId: outlet.id,
        customerId: spec.customerId,
        channel: spec.channel,
        fulfilment: spec.fulfilment,
        tableNo: spec.tableNo ?? null,
        status,
        subtotalPaise: cart.subtotalPaise,
        discountPaise: cart.discountPaise,
        discountCodeId: spec.code?.id ?? null,
        totalPaise: cart.totalPaise,
        paymentMethod: spec.paymentMethod,
        // Every seeded UPI order has settled; `awaiting` is reached live through /mock/pay.
        paymentStatus: spec.paymentMethod === 'upi_link' ? 'paid' : 'unpaid',
        addressId: spec.addressId ?? null,
        addressStatus: spec.addressStatus ?? 'na',
        notes: spec.notes ?? null,
        placedAt,
        confirmedAt,
        deliveredAt: reached('delivered'),
      }).returning())[0], 'order row')

      await tx.insert(s.orderItem).values(spec.lines.map((input, i) => {
        const priced = must(cart.lines[i], `cart line ${i}`)
        return {
          orderId: order.id,
          itemId: input.itemId,
          variantId: input.variantId ?? null,
          // ponytail: the options snapshot is [{ id, name, priceDeltaPaise }] — what a receipt and a
          // kitchen ticket need after the menu has changed. If the repo's createOrder settles on
          // another shape, this line and the ordering page change together.
          options: input.optionIds.map((id) => must(optionById.get(id), `option ${id}`)),
          qty: input.qty,
          unitPricePaise: priced.unitPricePaise,
          nameSnapshot: priced.itemName,
        }
      }))

      await tx.insert(s.orderEvent).values([
        { orderId: order.id, fromStatus: null, toStatus: 'received', actorType: spec.placedBy.type, actorId: spec.placedBy.id, at: placedAt },
        ...events.map((e) => ({ ...e, orderId: order.id })),
      ])

      if (spec.paymentMethod === 'upi_link') {
        // Ids and payload in the shape src/adapters/payments/mock.ts emits, so a row the webhook
        // route writes and a row the seed wrote are indistinguishable to the dashboard.
        const linkId = `plink_mock_${randomUUID().replaceAll('-', '')}`
        const paymentId = `pay_mock_${randomUUID().replaceAll('-', '')}`
        await tx.insert(s.payment).values({
          orderId: order.id,
          gateway: 'mock',
          linkId,
          paymentId,
          amountPaise: cart.totalPaise,
          status: 'paid',
          methodDetail: 'upi',
          webhookPayload: {
            event: 'payment_link.paid',
            payload: {
              payment_link: { entity: { id: linkId, amount: cart.totalPaise, amount_paid: cart.totalPaise, reference_id: order.id, status: 'paid' } },
              payment: { entity: { id: paymentId, amount: cart.totalPaise, method: 'upi', status: 'captured' } },
            },
          },
          createdAt: placedAt,
          paidAt: confirmedAt ?? placedAt,
        })
      }

      return { id: order.id, placedAt, totalPaise: cart.totalPaise }
    }

    const priyaUsual = [line('Masala Dosa', 2, { options: ['Extra ghee'] }), line('Filter Coffee', 2, { variant: 'Large' })]

    // Two hours of an ordinary evening, oldest first. Minutes are "ago".
    const delivered = await placeOrder({
      channel: 'page_delivery', fulfilment: 'delivery', customerId: divya.customer.id, addressId: divya.address.id, addressStatus: 'confirmed',
      paymentMethod: 'upi_link', placedMinutesAgo: 110, placedBy: byCustomer(divya.customer.id),
      lines: [line('Set Dosa', 2), line('Chow Chow Bath', 1), line('Filter Coffee', 2, { variant: 'Regular' })],
      trail: [
        { to: 'awaiting_payment', minutesAgo: 109.9, by: system }, { to: 'confirmed', minutesAgo: 108, by: system },
        { to: 'preparing', minutesAgo: 105, by: byStaff }, { to: 'ready', minutesAgo: 88, by: byStaff },
        { to: 'out_for_delivery', minutesAgo: 85, by: byStaff }, { to: 'delivered', minutesAgo: 72, by: byStaff },
      ],
    })

    // The flagship: a card scanned from aggregator packaging, WELCOME10 applied, paid by UPI.
    const winBack = await placeOrder({
      channel: 'page_delivery', fulfilment: 'delivery', customerId: arjun.customer.id, addressId: arjun.address.id, addressStatus: 'confirmed',
      paymentMethod: 'upi_link', code: { id: welcome10.id, percent: welcome10.percent }, placedMinutesAgo: 57, placedBy: byCustomer(arjun.customer.id),
      lines: [line('Chicken Donne Biryani', 1, { options: ['Raita'] }), line('Chicken Curry', 1, { variant: 'Full' }), line('Tandoori Roti', 4), line('Buttermilk (Majjige)', 1)],
      trail: [
        { to: 'awaiting_payment', minutesAgo: 56.9, by: system }, { to: 'confirmed', minutesAgo: 55, by: system },
        { to: 'preparing', minutesAgo: 52, by: byStaff }, { to: 'ready', minutesAgo: 31, by: byStaff },
        { to: 'out_for_delivery', minutesAgo: 27, by: byStaff },
      ],
    })

    await placeOrder({
      channel: 'staff_manual', fulfilment: 'pickup', customerId: null, paymentMethod: 'upi_link', placedMinutesAgo: 38, placedBy: byOwner,
      lines: [line('Chicken Donne Biryani', 1, { options: ['Salan'] }), line('Paneer Butter Masala', 1, { variant: 'Half' }), line('Butter Naan', 3)],
      trail: [
        { to: 'awaiting_payment', minutesAgo: 37.9, by: system }, { to: 'confirmed', minutesAgo: 35, by: system },
        { to: 'preparing', minutesAgo: 33, by: byStaff }, { to: 'ready', minutesAgo: 12, by: byStaff },
      ],
      notes: 'Phone order. Collecting at the counter.',
    })

    await placeOrder({
      channel: 'page_table', fulfilment: 'dine_in', tableNo: '12', customerId: null, paymentMethod: 'pay_at_table', placedMinutesAgo: 21, placedBy: byCustomer(null),
      lines: [line('Bisi Bele Bath', 1), line('Rava Idli', 1), line('Masala Chai', 1)],
      trail: [{ to: 'confirmed', minutesAgo: 20, by: byStaff }, { to: 'preparing', minutesAgo: 14, by: byStaff }],
    })

    // Build Spec §4: "handoff incomplete; staff completes or cancels". At M1 this is reached only
    // from manual entry (M1 design, "Order states"), so a staff member raised it. The address is
    // not yet known, hence `pending` with no address row.
    await placeOrder({
      channel: 'staff_manual', fulfilment: 'delivery', customerId: handoff.id, addressStatus: 'pending', paymentMethod: 'cod', placedMinutesAgo: 16, placedBy: byOwner,
      lines: [line('Veg Biryani', 1), line('Dal Tadka', 1, { variant: 'Half' }), line('Kerala Parotta (2 pcs)', 2)],
      trail: [{ to: 'needs_attention', minutesAgo: 15, by: byOwner }],
      notes: 'Call dropped before the address was complete. Call the customer back to confirm it.',
    })

    const priyaOrder = await placeOrder({
      channel: 'page_delivery', fulfilment: 'delivery', customerId: priya.customer.id, addressId: priya.address.id, addressStatus: 'confirmed',
      paymentMethod: 'cod', placedMinutesAgo: 8, placedBy: byCustomer(priya.customer.id), lines: priyaUsual, trail: [],
    })

    await placeOrder({
      channel: 'page_table', fulfilment: 'dine_in', tableNo: '7', customerId: tableSeven.id, paymentMethod: 'pay_at_table', placedMinutesAgo: 3, placedBy: byCustomer(tableSeven.id),
      lines: [line('Masala Dosa', 2, { options: ['Extra ghee'] }), line('Idli Vada', 1), line('Filter Coffee', 2, { variant: 'Regular' })],
      trail: [],
    })

    // ---- profiles, redemption, denominators ------------------------------------------------
    const profile = (p: typeof priya, extra: Omit<typeof s.customerRestaurant.$inferInsert, 'customerId' | 'restaurantId' | 'consentId'>) =>
      tx.insert(s.customerRestaurant).values({ customerId: p.customer.id, restaurantId: restaurant.id, consentId: p.consent.id, ...extra }).returning()

    // ponytail: usual_order = { lines: CartItemInput[] } so the reorder shortcut feeds priceCart
    // as-is. Its ceiling is a republished menu with new item ids; the upgrade is to resolve by
    // name_snapshot from the last order instead of storing ids.
    for (const [p, row] of [
      [priya, { source: 'page', firstChannel: 'page_delivery', orderCount: 7, lastOrderAt: priyaOrder.placedAt, ltvPaise: priyaOrder.totalPaise + 198_000, usualOrder: { lines: priyaUsual }, notes: 'Regular. Asks for extra ghee on everything.' }],
      [arjun, { source: 'win_back', firstChannel: 'page_delivery', orderCount: 1, lastOrderAt: winBack.placedAt, ltvPaise: winBack.totalPaise }],
      [divya, { source: 'page', firstChannel: 'page_delivery', orderCount: 2, lastOrderAt: delivered.placedAt, ltvPaise: delivered.totalPaise + 41_000 }],
    ] as const) {
      const [inserted] = await profile(p, row)
      await audit(p.customer.id, 'customer_restaurant', p.customer.id, must(inserted, 'customer_restaurant row'))
    }

    await tx.insert(s.codeRedemption).values({
      codeId: welcome10.id, restaurantId: restaurant.id, kind: 'win_back_card', customerId: arjun.customer.id,
      orderId: winBack.id, redeemedAt: winBack.placedAt, channel: 'page_delivery',
    })

    await tx.insert(s.externalOrderCount).values([
      { outletId: outlet.id, weekStart: dateOnly(monday(3)), swiggyOrders: 61, zomatoOrders: 48, otherOrders: 3, enteredBy: owner.id, enteredAt: new Date(monday(2).getTime() + 4 * 3_600_000) },
      { outletId: outlet.id, weekStart: dateOnly(monday(2)), swiggyOrders: 57, zomatoOrders: 52, otherOrders: 2, enteredBy: owner.id, enteredAt: new Date(monday(1).getTime() + 4 * 3_600_000) },
    ])

    return { restaurant, outlet, askedFor: dateOnly(monday(1)) }
  })

  console.log(`
seeded ${summary.restaurant.name} (fictional)
  slug            ${summary.restaurant.slug}
  outlet id       ${summary.outlet.id}
  codes           WELCOME10 (batch 1, placed)   WELCOME10B (batch 2, printed, not yet placed)
  monday nag      week of ${summary.askedFor} has no external_order_count row
  logins          owner ${PHONE.owner}   staff ${PHONE.staff}   agent ${PHONE.agent}   admin ${PHONE.admin}
  otp             VENDOR_MODE=mock shows OTPs on screen
  try             /r/${SLUG}?t=7   /r/${SLUG}?c=WELCOME10   /app   /agent
`)
  return 'seeded'
}

if (import.meta.main) {
  const { db } = await import('./client.ts')
  await seed(db)
  process.exit(0)
}
