import { cookies } from 'next/headers'
import { Button } from '@/ui/Button.tsx'
import { Field } from '@/ui/Field.tsx'
import fieldStyles from '@/ui/Field.module.css'
import { td } from '@/ui/i18n-dashboard.ts'
import { t } from '@/ui/i18n.ts'
import { LANGS, LANG_NAMES } from '@/ui/lang.ts'
import { THEME_COOKIE, readLang } from '../../_lib/prefs.ts'
import { currentOutlet } from '../../_lib/session.ts'
import { setLang, setTheme } from './actions.ts'
import { SettingsForm, type SettingsValues } from './SettingsForm.tsx'
import styles from './Settings.module.css'

export const metadata = { title: 'Settings — ServeLine' }

type Hours = Record<string, [string, string][]>

/**
 * Build Spec §7 "Settings", owner only (Build Spec §10: staff cannot change settings). The
 * Display section — theme (ADR 0002 §3) and language — is a per-device preference, not a
 * restaurant setting, so every role sees it: the counter operator at 11pm is usually `staff`.
 */
export default async function SettingsPage() {
  const { outlet, session } = await currentOutlet()
  const lang = await readLang()
  const theme = (await cookies()).get(THEME_COOKIE)?.value ?? 'os'

  const hours = (outlet.hours ?? {}) as Hours
  const values: SettingsValues = {
    hours: Object.fromEntries(Object.entries(hours).map(([d, spans]) => [d, spans.map((s) => s.join('-')).join(', ')])),
    holidayDates: outlet.holidayDates.join('\n'),
    deliveryRadiusKm: outlet.deliveryRadiusKm,
    serviceablePincodes: outlet.serviceablePincodes.join(', '),
    codEnabled: outlet.codEnabled,
    ownerMobile: outlet.ownerMobile?.replace(/^\+91/, '') ?? '',
    handoffNumber: outlet.handoffNumber?.replace(/^\+91/, '') ?? '',
    languages: outlet.languages,
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>{td('nav.settings', lang)}</h1>

      <section className={styles.fieldset}>
        <h2 className={styles.legend} style={{ margin: 0 }}>Display</h2>
        <form action={setTheme} className={styles.segmented} aria-label="Theme">
          {(['os', 'light', 'dark'] as const).map((v) => (
            <Button key={v} size="counter" variant={theme === v ? 'primary' : 'ghost'} type="submit" name="theme" value={v} aria-pressed={theme === v}>
              {v === 'os' ? 'Follow phone' : v === 'light' ? 'Light' : 'Dark'}
            </Button>
          ))}
        </form>
        <form action={setLang} className="flex items-end gap-[var(--space-12)]">
          <Field id="lang" label={t('common.language', lang)}>
            {(p) => (
              <select {...p} name="lang" className={fieldStyles.control} defaultValue={lang}>
                {LANGS.map((l) => <option key={l} value={l} lang={l}>{LANG_NAMES[l]}</option>)}
              </select>
            )}
          </Field>
          <Button size="counter" variant="ghost" type="submit">{t('common.save', lang)}</Button>
        </form>
      </section>

      {session.role === 'owner' ? (
        <SettingsForm values={values} />
      ) : (
        <p className={styles.hint}>Restaurant settings — hours, delivery, phones, languages — are the owner&rsquo;s to change.</p>
      )}
    </div>
  )
}
