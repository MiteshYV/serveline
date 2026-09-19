'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { z } from 'zod'
import { normalisePhone } from '@/core/phone.ts'
import { updateOutletSettings, type OutletSettingsPatch } from '@/db/repos/index.ts'
import { isLang } from '@/ui/lang.ts'
import { APP_COOKIE, LANG_COOKIE, SITE_COOKIE, THEME_COOKIE } from '../../_lib/prefs.ts'
import { currentOutlet } from '../../_lib/session.ts'

// ---- display preferences: every role, per device ------------------------------------------

/** ADR 0002 §3: the dashboard's manual light/dark toggle. "os" clears it. */
export async function setTheme(form: FormData): Promise<void> {
  await currentOutlet()
  const v = form.get('theme')
  const jar = await cookies()
  if (v === 'light' || v === 'dark') jar.set(THEME_COOKIE, v, APP_COOKIE)
  else jar.delete({ name: THEME_COOKIE, path: APP_COOKIE.path })
  revalidatePath('/app', 'layout')
}

export async function setLang(form: FormData): Promise<void> {
  await currentOutlet()
  const v = form.get('lang')
  if (isLang(v)) (await cookies()).set(LANG_COOKIE, v, SITE_COOKIE)
  revalidatePath('/app', 'layout')
}

// ---- outlet settings: owner only (Build Spec §10) -------------------------------------------

export type SettingsState = { saved?: boolean; error?: string; fieldErrors?: Record<string, string> }

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

/** "07:00-15:30, 18:30-22:30" → [["07:00","15:30"],["18:30","22:30"]]; blank → closed. */
function parseHours(raw: string): [string, string][] | null {
  const text = raw.trim()
  if (!text) return []
  const out: [string, string][] = []
  for (const span of text.split(/\s*,\s*/)) {
    const m = /^(\S+)\s*[-–]\s*(\S+)$/.exec(span)
    if (!m || !m[1] || !m[2] || !TIME.test(m[1]) || !TIME.test(m[2]) || m[1] >= m[2]) return null
    out.push([m[1], m[2]])
  }
  return out
}

const Settings = z.object({
  deliveryRadiusKm: z.string().regex(/^\d{1,2}(\.\d)?$/, 'Kilometres, one decimal at most'),
  serviceablePincodes: z.array(z.string().regex(/^\d{6}$/)),
  holidayDates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  codEnabled: z.boolean(),
  languages: z.array(z.enum(['hi', 'en', 'kn'])).min(1, 'Keep at least one language'),
})

/** Build Spec §7 "Settings": hours and holidays, radius and pincodes, COD, owner mobile and handoff number, languages. */
export async function saveSettings(_prev: SettingsState, form: FormData): Promise<SettingsState> {
  const { outlet, session, actor } = await currentOutlet()
  if (session.role !== 'owner') return { error: 'Only the owner can change settings' }

  const str = (k: string) => (typeof form.get(k) === 'string' ? (form.get(k) as string) : '')
  const fieldErrors: Record<string, string> = {}

  const hours: Record<string, [string, string][]> = {}
  for (const d of DAYS) {
    const parsed = parseHours(str(`hours.${d}`))
    if (parsed === null) fieldErrors[`hours.${d}`] = 'Use HH:MM-HH:MM, comma-separated; blank for closed'
    else hours[d] = parsed
  }

  const phones: { ownerMobile: string | null; handoffNumber: string | null } = { ownerMobile: null, handoffNumber: null }
  for (const k of ['ownerMobile', 'handoffNumber'] as const) {
    const v = str(k).trim()
    if (!v) continue
    try {
      phones[k] = normalisePhone(v)
    } catch {
      fieldErrors[k] = 'Enter a 10-digit mobile number'
    }
  }

  const parsed = Settings.safeParse({
    deliveryRadiusKm: str('deliveryRadiusKm').trim(),
    serviceablePincodes: str('serviceablePincodes').split(/[\s,]+/).filter(Boolean),
    holidayDates: str('holidayDates').split(/[\s,]+/).filter(Boolean),
    codEnabled: form.get('codEnabled') === 'on',
    languages: form.getAll('languages').filter((v): v is string => typeof v === 'string'),
  })
  if (!parsed.success) {
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0] ?? 'form')] = issue.message
  }
  if (Object.keys(fieldErrors).length > 0 || !parsed.success) return { fieldErrors }

  const patch: OutletSettingsPatch = { hours, ...parsed.data, ...phones }
  try {
    await updateOutletSettings(outlet.id, patch, actor)
  } catch {
    return { error: 'Could not save. Try again.' }
  }
  revalidatePath('/app/settings')
  return { saved: true }
}
