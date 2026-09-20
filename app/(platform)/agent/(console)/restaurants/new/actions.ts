'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { phonePepper } from '@/auth/secrets.ts'
import { requirePlatform } from '@/auth/session.ts'
import { hashPhone, normalisePhone } from '@/core/phone.ts'
import { createRestaurant, getRestaurantBySlug } from '@/db/repos/index.ts'

export type NewRestaurantState = { errors?: Record<string, string>; error?: string }

const PHONE_MESSAGE = 'Enter a 10-digit mobile number starting with 6, 7, 8 or 9'

const phone = z.string().transform((v, ctx) => {
  try {
    return normalisePhone(v)
  } catch {
    ctx.addIssue({ code: 'custom', message: PHONE_MESSAGE })
    return z.NEVER
  }
})

const optionalPhone = z.string().trim().transform((v, ctx) => {
  if (v === '') return null
  try {
    return normalisePhone(v)
  } catch {
    ctx.addIssue({ code: 'custom', message: PHONE_MESSAGE })
    return z.NEVER
  }
})

/** Build Spec §4 column shapes; §11 step 1 is the only product rule here. */
const schema = z.object({
  name: z.string().trim().min(2, 'At least 2 characters').max(80, 'At most 80 characters'),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/, 'Lowercase letters, digits and hyphens'),
  brandColour: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, 'A six-digit hex like #1F6F5C').transform((s) => s.toUpperCase()),
  trialCallLimit: z.coerce.number().int('Whole number').min(0).max(100_000),
  outletName: z.string().trim().min(1, 'Required').max(80),
  addressLine: z.string().trim().min(1, 'Required').max(200),
  area: z.string().trim().min(1, 'Required').max(80),
  pincode: z.string().trim().regex(/^\d{6}$/, 'Six digits'),
  displayPhone: optionalPhone,
  codEnabled: z.boolean(),
  languages: z.array(z.enum(['hi', 'en', 'kn'])).min(1, 'Choose at least one language'),
  ownerName: z.string().trim().min(1, 'Required').max(80),
  ownerPhone: phone,
})

export async function createRestaurantAction(_prev: NewRestaurantState, fd: FormData): Promise<NewRestaurantState> {
  const session = await requirePlatform()
  const text = (k: string) => {
    const v = fd.get(k)
    return typeof v === 'string' ? v : ''
  }
  const parsed = schema.safeParse({
    name: text('name'),
    slug: text('slug'),
    brandColour: text('brandColour'),
    trialCallLimit: text('trialCallLimit'),
    outletName: text('outletName'),
    addressLine: text('addressLine'),
    area: text('area'),
    pincode: text('pincode'),
    displayPhone: text('displayPhone'),
    codEnabled: fd.has('codEnabled'),
    languages: fd.getAll('languages').filter((v): v is string => typeof v === 'string'),
    ownerName: text('ownerName'),
    ownerPhone: text('ownerPhone'),
  })
  if (!parsed.success) {
    const errors: Record<string, string> = {}
    for (const issue of parsed.error.issues) errors[String(issue.path[0])] ??= issue.message
    return { errors }
  }
  const d = parsed.data
  if (await getRestaurantBySlug(d.slug)) return { errors: { slug: 'That slug is already taken' } }

  let id: string
  try {
    const created = await createRestaurant({
      name: d.name,
      slug: d.slug,
      brandColour: d.brandColour,
      trialCallLimit: d.trialCallLimit,
      outlet: {
        name: d.outletName,
        addressLine: d.addressLine,
        area: d.area,
        pincode: d.pincode,
        displayPhone: d.displayPhone,
        codEnabled: d.codEnabled,
        languages: d.languages,
      },
      owner: { name: d.ownerName, phone: d.ownerPhone, phoneHash: hashPhone(d.ownerPhone, phonePepper()) },
    }, { type: 'platform', id: session.subjectId })
    id = created.restaurant.id
  } catch {
    // The unique index has the last word on the slug (a race with the check above). The agent
    // console may show an error (design §7.10), but a fixed one, never the error's own text: a
    // failed insert's message can carry its parameters, and two of them are the owner's mobile.
    return { error: 'Could not create the restaurant' }
  }
  revalidatePath('/agent')
  redirect(`/agent/restaurants/${id}`)
}
