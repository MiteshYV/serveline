'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { clearSession, requirePlatform } from '@/auth/session.ts'
import { AGENT_THEME_COOKIE, AGENT_THEME_COOKIE_OPTIONS } from '@/ui/theme.ts'

export async function signOut(): Promise<void> {
  await clearSession('platform')
  redirect('/agent/login')
}

/**
 * ADR 0002 §3 gives every staff surface a manual light/dark toggle. The console is one — thirteen
 * routes an operator may be reading at 11pm — and had none.
 *
 * Its own cookie, scoped to /agent, rather than sharing the dashboard's. `sl_theme` is scoped to
 * /app so the browser never sends it here, and widening it to `/` would put a staff choice on a
 * customer's phone, which ADR 0002 §3 forbids. Two narrow cookies keep that guarantee structural.
 *
 * Revalidates `/` because `<html data-theme>` is written by the root layout, not by this one.
 */
export async function setPlatformTheme(form: FormData): Promise<void> {
  await requirePlatform()
  const v = form.get('theme')
  const jar = await cookies()
  if (v === 'light' || v === 'dark') jar.set(AGENT_THEME_COOKIE, v, AGENT_THEME_COOKIE_OPTIONS)
  else jar.delete({ name: AGENT_THEME_COOKIE, path: AGENT_THEME_COOKIE_OPTIONS.path })
  revalidatePath('/', 'layout')
}
