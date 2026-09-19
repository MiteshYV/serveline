'use server'

import type { Route } from 'next'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { requirePlatform } from '@/auth/session.ts'
import type { Actor } from '@/db/repos/index.ts'
import {
  deleteCategory, deleteItem, ensureMenu, publishMenu, setItemAvailability, upsertCategory,
} from '@/db/repos/index.ts'

/**
 * The menu editor's small writes (Build Spec §7 "item add and edit", §8 "publish"). Each is a
 * plain <form action>, so the outcome travels back as a redirect: clean on success, `?error=`
 * on failure. These forms hold one or two fields, so the redirect loses nothing worth keeping.
 */

const ctx = z.object({ restaurantId: z.uuid(), outletId: z.uuid() })
const uuid = z.uuid()

/** A Postgres error arrives wrapped by Drizzle; the cause carries the readable message. */
function describe(e: unknown): string {
  const msg = e instanceof Error ? (e.cause instanceof Error ? e.cause.message : e.message) : String(e)
  return /violates foreign key/.test(msg)
    ? 'Cannot delete: it has already been ordered. Mark it unavailable instead.'
    : msg
}

async function guarded(fd: FormData, run: (actor: Actor) => Promise<unknown>): Promise<void> {
  const session = await requirePlatform()
  const { restaurantId, outletId } = ctx.parse({ restaurantId: fd.get('restaurantId'), outletId: fd.get('outletId') })
  let error: string | null = null
  try {
    await run({ type: 'platform', id: session.subjectId })
  } catch (e) {
    error = describe(e)
  }
  const path = `/agent/restaurants/${restaurantId}/menu`
  revalidatePath(path)
  revalidatePath(`/agent/restaurants/${restaurantId}`)
  const back = `${path}?outlet=${outletId}`
  redirect((error ? `${back}&error=${encodeURIComponent(error)}` : back) as Route)
}

const text = (fd: FormData, k: string) => {
  const v = fd.get(k)
  return typeof v === 'string' ? v : ''
}

export async function createMenu(fd: FormData): Promise<void> {
  return guarded(fd, (actor) => ensureMenu(uuid.parse(fd.get('outletId')), actor))
}

export async function publish(fd: FormData): Promise<void> {
  return guarded(fd, (actor) => publishMenu(uuid.parse(fd.get('outletId')), actor))
}

export async function saveCategory(fd: FormData): Promise<void> {
  return guarded(fd, (actor) => upsertCategory({
    id: text(fd, 'id') || undefined,
    menuId: uuid.parse(fd.get('menuId')),
    name: text(fd, 'name'),
    sort: z.coerce.number().int().min(0).max(9999).parse(text(fd, 'sort') || '0'),
  }, actor))
}

export async function removeCategory(fd: FormData): Promise<void> {
  return guarded(fd, (actor) => deleteCategory(uuid.parse(fd.get('id')), actor))
}

export async function setAvailability(fd: FormData): Promise<void> {
  return guarded(fd, (actor) => setItemAvailability(uuid.parse(fd.get('itemId')), text(fd, 'isAvailable') === 'true', actor))
}

export async function removeItem(fd: FormData): Promise<void> {
  return guarded(fd, (actor) => deleteItem(uuid.parse(fd.get('itemId')), actor))
}
