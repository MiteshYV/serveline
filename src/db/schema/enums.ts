import { pgEnum } from 'drizzle-orm/pg-core'

// Every enum in the Build Spec §4. Values are the spec's, verbatim — do not rename one
// without changing the spec, because the dashboard, the API and the metric views all read them.

export const restaurantStatus = pgEnum('restaurant_status', [
  'trialing', 'active', 'suspended', 'churned',
])

export const outletStatus = pgEnum('outlet_status', ['active', 'paused', 'closed'])

export const staffRole = pgEnum('staff_role', ['owner', 'staff'])
export const platformRole = pgEnum('platform_role', ['agent', 'admin'])

/** Hindi, English, Kannada. Ideation §11 caps the MVP at these three. */
export const language = pgEnum('language', ['hi', 'en', 'kn'])

export const spiceLevel = pgEnum('spice_level', ['none', 'mild', 'medium', 'hot'])

/** How this customer first reached this restaurant. `win_back` is the flywheel's entry point. */
export const customerSource = pgEnum('customer_source', [
  'win_back', 'organic_call', 'table', 'page', 'staff',
])

export const consentChannel = pgEnum('consent_channel', ['call', 'page', 'staff'])

export const addressSource = pgEnum('address_source', ['page', 'voice_rough', 'staff'])

export const orderChannel = pgEnum('order_channel', [
  'ai_call', 'page_table', 'page_delivery', 'staff_manual',
])

export const fulfilment = pgEnum('fulfilment', ['delivery', 'pickup', 'dine_in'])

/**
 * Build Spec §4. `address_pending` and `needs_attention` are only produced by the voice
 * service (M2) and by manual dashboard entry; they are in the enum from the start so that
 * M2 needs no enum migration.
 */
export const orderStatus = pgEnum('order_status', [
  'received',
  'address_pending',
  'awaiting_payment',
  'confirmed',
  'preparing',
  'ready',
  'out_for_delivery',
  'delivered',
  'cancelled',
  'needs_attention',
])

export const paymentMethod = pgEnum('payment_method', ['upi_link', 'cod', 'pay_at_table'])
export const paymentStatus = pgEnum('payment_status', ['unpaid', 'awaiting', 'paid', 'refunded'])
export const addressStatus = pgEnum('address_status', ['na', 'pending', 'confirmed'])

export const discountKind = pgEnum('discount_kind', ['win_back_card', 'manual'])

export const smsKind = pgEnum('sms_kind', [
  'otp', 'order_confirm', 'payment_link', 'page_link', 'address_link',
])
export const smsStatus = pgEnum('sms_status', ['queued', 'sent', 'delivered', 'failed'])

export const actorType = pgEnum('actor_type', ['customer', 'staff', 'platform', 'system', 'ai'])
