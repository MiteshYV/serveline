'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { isLang, LANG_COOKIE } from '@/ui/lang.ts'

/** Build Spec §6: the hi/en/kn toggle. One cookie, a year, then back to where the customer was. */
export async function setLanguage(lang: string, returnTo: string): Promise<void> {
  if (!isLang(lang)) return
  ;(await cookies()).set(LANG_COOKIE, lang, {
    path: '/',
    maxAge: 365 * 86_400,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  })
  // Only a path under /r/ on this site: an absolute URL here would be an open redirect.
  const safe = /^\/r\/[a-z0-9-]+(\/[^\s]*)?$/.test(returnTo) ? returnTo : '/r/'
  redirect(safe as `/r/${string}`)
}
