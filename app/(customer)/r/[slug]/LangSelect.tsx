'use client'

import { useTransition } from 'react'
import { t, type Lang } from '@/ui/i18n.ts'
import { LANG_NAMES, LANGS } from '@/ui/lang.ts'
import { setLanguage } from './actions.ts'
import styles from './customer.module.css'

/**
 * Design §9: a real, labelled <select>; never a flag. Changing it sets the cookie the root
 * layout reads for `<html lang>` and reloads this URL in the new language.
 */
export function LangSelect({ lang }: { lang: Lang }) {
  const [pending, start] = useTransition()
  return (
    <label className={styles.lang}>
      <span>{t('common.language', lang)}</span>
      <select
        className={styles.langSelect}
        value={lang}
        disabled={pending}
        onChange={(e) => {
          const next = e.currentTarget.value
          start(() => setLanguage(next, `${window.location.pathname}${window.location.search}`))
        }}
      >
        {LANGS.map((l) => (
          <option key={l} value={l} lang={l}>
            {LANG_NAMES[l]}
          </option>
        ))}
      </select>
    </label>
  )
}
