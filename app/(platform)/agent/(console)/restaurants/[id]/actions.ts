'use server'

import type { Route } from 'next'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { requirePlatform } from '@/auth/session.ts'
import { updateRestaurantAdmin } from '@/db/repos/index.ts'

/**
 * Build Spec §8 "Admin only: suspend and reactivate restaurants, edit plan limits". The role
 * comes from the session, never from the form. Errors go back to the page as `?error=`; these
 * are one-field forms, so nothing worth keeping is lost by the redirect.
 */

const id = z.uuid()

async function admin(fd: FormData) {
  const session = await requirePlatform()
  if (session.role !== 'admin') throw new Error('Admin only')
  return { restaurantId: id.parse(fd.get('id')), actor: { type: 'platform' as const, id: session.subjectId } }
}

function back(restaurantId: string, error?: string): never {
  revalidatePath(`/agent/restaurants/${restaurantId}`)
  revalidatePath('/agent')
  const path = `/agent/restaurants/${restaurantId}`
  redirect((error ? `${path}?error=${encodeURIComponent(error)}` : path) as Route)
}

/**
 * Reactivating sets `active`, not the status held before suspension: the row does not remember
 * it, and Build Spec §4 does not say. Simplest reading; revisit if a trial must survive a suspension.
 */
export async function setRestaurantStatus(fd: FormData): Promise<void> {
  const { restaurantId, actor } = await admin(fd)
  const status = z.enum(['active', 'suspended']).parse(fd.get('status'))
  await updateRestaurantAdmin(restaurantId, { status }, actor)
  back(restaurantId)
}

export async function setTrialCallLimit(fd: FormData): Promise<void> {
  const { restaurantId, actor } = await admin(fd)
  const parsed = z.coerce.number().int().min(0).max(100_000).safeParse(fd.get('trialCallLimit'))
  if (!parsed.success) back(restaurantId, 'Trial call limit must be a whole number from 0 to 100000')
  await updateRestaurantAdmin(restaurantId, { trialCallLimit: parsed.data }, actor)
  back(restaurantId)
}
