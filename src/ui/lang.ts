import type { Lang } from './i18n.ts'

/** The customer's chosen language (Build Spec §6: hi, en, kn toggle), read by the root layout for `<html lang>`. */
export const LANG_COOKIE = 'sl_lang'

export const LANGS: readonly Lang[] = ['en', 'hi', 'kn']

export const isLang = (v: unknown): v is Lang => typeof v === 'string' && (LANGS as readonly string[]).includes(v)

/** Endonyms, never flags (design §11.19). */
export const LANG_NAMES: Record<Lang, string> = { en: 'English', hi: 'हिन्दी', kn: 'ಕನ್ನಡ' }
