'use server'

import type { Route } from 'next'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { requirePlatform } from '@/auth/session.ts'
import { upsertItem } from '@/db/repos/index.ts'
import { parseItemForm } from '@/ui/itemForm.ts'

export type ItemFormState = { errors?: Record<string, string>; error?: string }

const ctx = z.object({ restaurantId: z.uuid(), outletId: z.uuid() })

/** Validate at the boundary (src/ui/itemForm.ts), then one repo call; the repo audits. */
export async function saveItem(_prev: ItemFormState, fd: FormData): Promise<ItemFormState> {
  const session = await requirePlatform()
  const where = ctx.safeParse({ restaurantId: fd.get('restaurantId'), outletId: fd.get('outletId') })
  if (!where.success) return { error: 'The form lost its restaurant or outlet. Reload and try again.' }

  const parsed = parseItemForm(fd)
  if (!parsed.ok) return { errors: parsed.errors }

  try {
    await upsertItem(parsed.input, { type: 'platform', id: session.subjectId })
  } catch (e) {
    const msg = e instanceof Error ? (e.cause instanceof Error ? e.cause.message : e.message) : String(e)
    return {
      error: /violates foreign key/.test(msg)
        ? 'A removed variant has already been ordered and cannot be deleted. Keep it, or rename it.'
        : msg,
    }
  }
  const path = `/agent/restaurants/${where.data.restaurantId}/menu`
  revalidatePath(path)
  redirect(`${path}?outlet=${where.data.outletId}` as Route)
}
