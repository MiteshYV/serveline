'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createBatch } from '@/db/repos/index.ts'
import { currentOutlet } from '../../_lib/session.ts'

export type BatchState = { error?: string; created?: number }

const Batch = z.object({
  qty: z.coerce.number().int().min(1).max(5000),
  percent: z.coerce.number().int().min(1).max(100),
  validTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
})

/**
 * Build Spec §7 "Cards and codes": generate a batch (quantity, percent, validity). Owner only —
 * the spec does not say, and a batch is a promise printed 200 times, so it errs towards the
 * person who pays for the discount (Ideation §10).
 */
export async function generateBatch(_prev: BatchState, form: FormData): Promise<BatchState> {
  const { restaurant, outlet, session, actor } = await currentOutlet()
  if (session.role !== 'owner') return { error: 'Only the owner can generate cards.' }

  const parsed = Batch.safeParse({ qty: form.get('qty'), percent: form.get('percent'), validTo: form.get('validTo') ?? '' })
  if (!parsed.success) return { error: 'Quantity 1–5000, percent 1–100, and a date if you want one.' }

  const validTo = parsed.data.validTo ? new Date(`${parsed.data.validTo}T23:59:59+05:30`) : undefined
  await createBatch({ restaurantId: restaurant.id, outletId: outlet.id, qty: parsed.data.qty, percent: parsed.data.percent, validTo }, actor)
  revalidatePath('/app/cards')
  return { created: parsed.data.qty }
}
