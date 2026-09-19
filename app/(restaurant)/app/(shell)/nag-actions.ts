'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { z } from 'zod'
import { afterSkip, weekToAsk } from '@/core/aggregator-nag.ts'
import { upsertExternalCount } from '@/db/repos/index.ts'
import { APP_COOKIE, NAG_COOKIE, readNagCookie } from '../_lib/prefs.ts'
import { currentOutlet } from '../_lib/session.ts'

export type NagState = { error?: 'invalid' | 'failed' }

const Counts = z.object({
  swiggy: z.coerce.number().int().min(0).max(100_000),
  zomato: z.coerce.number().int().min(0).max(100_000),
})

/** Build Spec §7: "every Monday the dashboard asks for last week's Swiggy and Zomato order counts". */
export async function saveExternalCount(_prev: NagState, form: FormData): Promise<NagState> {
  const parsed = Counts.safeParse({ swiggy: form.get('swiggy'), zomato: form.get('zomato') })
  if (!parsed.success) return { error: 'invalid' }
  const { outlet, actor } = await currentOutlet()
  try {
    await upsertExternalCount(
      { outletId: outlet.id, weekStart: weekToAsk(new Date()), swiggyOrders: parsed.data.swiggy, zomatoOrders: parsed.data.zomato },
      actor,
    )
  } catch {
    return { error: 'failed' }
  }
  // Answered: the skip streak is over. Design §7.8 — remove it from the DOM, not display:none;
  // revalidating re-renders the page without it.
  ;(await cookies()).delete({ name: NAG_COOKIE, path: APP_COOKIE.path })
  revalidatePath('/app')
  return {}
}

/** Design §7.8 "Skip this week": hides it for the day; three consecutive weekly skips → quiet four weeks. */
export async function skipNag(): Promise<void> {
  await currentOutlet()
  const next = afterSkip(await readNagCookie(), new Date())
  ;(await cookies()).set(NAG_COOKIE, JSON.stringify(next), APP_COOKIE)
  revalidatePath('/app')
}
