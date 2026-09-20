'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { payments } from '@/adapters/payments/index.ts'
import { sms } from '@/adapters/sms/index.ts'
import { phonePepper } from '@/auth/secrets.ts'
import { CartError, priceCart, type CartItemInput } from '@/core/cart.ts'
import { hasValidConsent } from '@/core/consent.ts'
import { formatINR, paise } from '@/core/money.ts'
import { hashPhone, normalisePhone } from '@/core/phone.ts'
import { checkServiceability } from '@/core/serviceability.ts'
import {
  attachPayment, createOrder, findCustomerByPhoneHash, getConsent, getCustomerRestaurant, getPublishedMenu, listAddresses,
  logSms, saveAddress, toPricedMenu, transitionOrder, upsertCustomer, upsertCustomerRestaurant,
} from '@/db/repos/index.ts'
import { appOrigin } from '../../../_lib/origin.ts'
import { currentOutlet } from '../../../_lib/session.ts'

/**
 * Build Spec §7 "Manual order entry: for handoff calls the staff finish by hand. Same cart UI as
 * the ordering page, with a phone field that links the order to a profile if consent exists."
 */

export type Lookup =
  | { ok: false }
  | {
      ok: true
      /** Known at *this* restaurant (a customer_restaurant row), never merely known to the platform. */
      found: boolean
      /** A live `order_fulfilment` consent at this restaurant (Build Spec §10). */
      consented: boolean
      name: string | null
      addresses: { id: string; label: string | null; line1: string; landmark: string | null; area: string | null; pincode: string | null }[]
    }

export async function lookupCustomer(phoneRaw: string): Promise<Lookup> {
  const { restaurant } = await currentOutlet()
  let phone: string
  try {
    phone = normalisePhone(phoneRaw)
  } catch {
    return { ok: false }
  }
  const customer = await findCustomerByPhoneHash(hashPhone(phone, phonePepper()))
  // `customer` is platform-wide. Nothing crosses restaurants (Build Spec §4), so a number with no
  // profile here answers exactly as a number nobody has seen — or staff could probe which phones
  // have ordered from some other ServeLine restaurant.
  const profile = customer ? await getCustomerRestaurant(customer.id, restaurant.id) : null
  if (!customer || !profile) return { ok: true, found: false, consented: false, name: null, addresses: [] }
  const consent = await getConsent(customer.id, restaurant.id)
  const consented = hasValidConsent(consent ?? undefined, 'order_fulfilment')
  // Nothing beyond the phone is shown without consent: the name and the addresses are profile fields.
  if (!consented) return { ok: true, found: true, consented: false, name: null, addresses: [] }
  const addresses = await listAddresses(customer.id, restaurant.id)
  return {
    ok: true,
    found: true,
    consented: true,
    name: customer.name,
    addresses: addresses.map((a) => ({ id: a.id, label: a.label, line1: a.line1, landmark: a.landmark, area: a.area, pincode: a.pincode })),
  }
}

const Line = z.object({
  itemId: z.uuid(),
  variantId: z.uuid().optional(),
  optionIds: z.array(z.uuid()).max(20),
  qty: z.number().int().min(1).max(99),
})

const Input = z.object({
  fulfilment: z.enum(['dine_in', 'pickup', 'delivery']),
  tableNo: z.string().trim().max(16).optional(),
  phone: z.string().trim().max(20).optional(),
  notes: z.string().trim().max(500).optional(),
  paymentMethod: z.enum(['cod', 'upi_link', 'pay_at_table']),
  lines: z.array(Line).min(1).max(50),
  addressId: z.uuid().optional(),
  newAddress: z.object({
    line1: z.string().trim().min(1).max(200),
    landmark: z.string().trim().max(200).optional(),
    pincode: z.string().trim().regex(/^\d{6}$/),
  }).optional(),
})
export type ManualOrderInput = z.infer<typeof Input>

export type PlaceResult = { ok: false; error: 'invalid' | 'phone' | 'table' | 'cart' | 'pincode' | 'upi_needs_phone' | 'no_menu' | 'failed' }

export async function placeManualOrder(raw: unknown): Promise<PlaceResult> {
  const parsed = Input.safeParse(raw)
  if (!parsed.success) return { ok: false, error: 'invalid' }
  const input = parsed.data
  const { outlet, restaurant, actor } = await currentOutlet()

  if (input.fulfilment === 'dine_in' && !input.tableNo) return { ok: false, error: 'table' }
  // A dine-in order pays at the table; the other two take cash or a UPI link (Build Spec §6, §7).
  const paymentMethod = input.fulfilment === 'dine_in' ? 'pay_at_table' : input.paymentMethod === 'pay_at_table' ? 'cod' : input.paymentMethod

  let phone: string | null = null
  if (input.phone) {
    try {
      phone = normalisePhone(input.phone)
    } catch {
      return { ok: false, error: 'phone' }
    }
  }
  if (paymentMethod === 'upi_link' && !phone) return { ok: false, error: 'upi_needs_phone' }

  const menu = await getPublishedMenu(outlet.id)
  if (!menu) return { ok: false, error: 'no_menu' }
  const inputs: CartItemInput[] = input.lines.map((l) => ({ itemId: l.itemId, ...(l.variantId ? { variantId: l.variantId } : {}), optionIds: l.optionIds, qty: l.qty }))
  let cart
  try {
    cart = priceCart(inputs, toPricedMenu(menu))
  } catch (e) {
    if (e instanceof CartError) return { ok: false, error: 'cart' }
    throw e
  }

  // The identity: phone only, which needs no consent (Build Spec §10). Whether anything more may
  // be stored — a name, an address, the order against the profile — is the consent's decision.
  let customerId: string | undefined
  let consentId: string | undefined
  let consentView: { noticeVersion: string; purposes: string[]; withdrawnAt: Date | null } | undefined
  if (phone) {
    const customer = await upsertCustomer({ phone, phoneHash: hashPhone(phone, phonePepper()) }, actor)
    customerId = customer.id
    const consent = await getConsent(customer.id, restaurant.id)
    if (consent) {
      consentId = consent.id
      consentView = { noticeVersion: consent.noticeVersion, purposes: consent.purposes, withdrawnAt: consent.withdrawnAt }
    }
  }
  const mayStoreProfile = hasValidConsent(consentView, 'order_fulfilment')

  let addressId: string | undefined
  if (input.fulfilment === 'delivery' && customerId && mayStoreProfile) {
    if (input.addressId) {
      const own = (await listAddresses(customerId, restaurant.id)).find((a) => a.id === input.addressId)
      if (!own) return { ok: false, error: 'invalid' }
      addressId = own.id
    } else if (input.newAddress) {
      const service = checkServiceability({ pincode: input.newAddress.pincode }, { area: outlet.area, serviceablePincodes: outlet.serviceablePincodes })
      if (!service.ok) return { ok: false, error: 'pincode' }
      const saved = await saveAddress({
        customerId,
        restaurantId: restaurant.id,
        label: null,
        line1: input.newAddress.line1,
        landmark: input.newAddress.landmark ?? null,
        area: null,
        pincode: input.newAddress.pincode,
        lat: null,
        lng: null,
        source: 'staff',
        isConfirmed: true,
      }, actor)
      addressId = saved.id
    }
  }

  const order = await createOrder({
    restaurantId: restaurant.id,
    outletId: outlet.id,
    channel: 'staff_manual',
    fulfilment: input.fulfilment,
    ...(input.tableNo ? { tableNo: input.tableNo } : {}),
    // Build Spec §7: the phone field "links the order to a profile if consent exists". Without
    // one the phone-only row still exists for the UPI link SMS, but the order is not linked to it.
    ...(customerId && mayStoreProfile ? { customerId } : {}),
    ...(addressId ? { addressId } : {}),
    paymentMethod,
    ...(input.notes ? { notes: input.notes } : {}),
    cart,
    inputs,
  }, actor)

  // M1 design "Order states": address_pending is reachable at M1 only through this path. A
  // delivery order with no stored address is pinned until staff confirm one by phone.
  if (input.fulfilment === 'delivery' && !addressId) await transitionOrder(order.id, 'address_pending', actor)

  if (paymentMethod === 'upi_link' && phone) {
    const link = await payments().createLink({ orderId: order.id, amountPaise: order.totalPaise, restaurantId: restaurant.id, description: `${restaurant.name} order` })
    await attachPayment({ orderId: order.id, gateway: 'mock', linkId: link.linkId, amountPaise: order.totalPaise }, actor)
    const origin = await appOrigin()
    const sent = await sms().send({
      toPhone: phone,
      kind: 'payment_link',
      language: 'en',
      vars: {
        restaurant: restaurant.name,
        total: `Rs ${formatINR(paise(order.totalPaise)).replace(/[^\d,.]/g, '').replace(/\.00$/, '')}`,
        url: link.url.startsWith('/') ? `${origin}${link.url}` : link.url,
      },
    })
    await logSms({ restaurantId: restaurant.id, toPhoneHash: hashPhone(phone, phonePepper()), kind: 'payment_link', provider: 'mock', providerMessageId: sent.providerMessageId, status: 'sent', costPaise: sent.costPaise, sentAt: new Date() })
  }

  // The profile is bumped only with `order_history` consent (repos/customers.ts enforces it too).
  if (customerId && hasValidConsent(consentView, 'order_history')) {
    const names = new Map(menu.items.map((i) => [i.id, i.name]))
    await upsertCustomerRestaurant({
      customerId,
      restaurantId: restaurant.id,
      source: 'staff',
      firstChannel: 'staff_manual',
      ...(consentId ? { consentId } : {}),
      order: {
        totalPaise: order.totalPaise,
        placedAt: order.placedAt,
        usualOrder: { items: inputs.map((l) => ({ ...l, name: names.get(l.itemId) ?? '' })) },
      },
    }, actor)
  }

  redirect(`/app/orders/${order.id}`)
}
