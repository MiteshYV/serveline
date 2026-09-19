'use client'

import { useActionState, useEffect, useId, useRef, useState } from 'react'
import { Band } from '@/ui/Band.tsx'
import { Button } from '@/ui/Button.tsx'
import { Field } from '@/ui/Field.tsx'
import fieldStyles from '@/ui/Field.module.css'
import { t, type Lang } from '@/ui/i18n.ts'
import { saveExternalCount, skipNag, type NagState } from './nag-actions.ts'
import styles from './MondayNag.module.css'

/** Design §7.8's ranges. The midpoint is what gets stored: "the range is enough for the metric". */
const PICKS: { label: string; value: number }[] = [
  { label: '0', value: 0 },
  { label: '1–10', value: 5 },
  { label: '11–25', value: 18 },
  { label: '26–50', value: 38 },
  { label: '50+', value: 75 },
]

const IDLE_MS = 20_000

type Props = { lang: Lang; weekStart: string }

/**
 * The Monday aggregator-count nag, design §7.8 to the letter: in normal flow below the header,
 * neutral ground and a steel edge (never a state colour), quick-pick chips before the exact
 * field, Save and an equally legible "Skip this week", a 44px ×. After 20 s with no interaction
 * it collapses to a one-line strip that can be reopened; it never vanishes without saying why.
 */
export function MondayNag({ lang, weekStart }: Props) {
  const [state, save, saving] = useActionState(saveExternalCount, {} as NagState)
  const [collapsed, setCollapsed] = useState(false)
  const [swiggy, setSwiggy] = useState('')
  const [zomato, setZomato] = useState('')
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null)
  const ids = { swiggy: useId(), zomato: useId() }

  const armIdle = () => {
    if (idle.current) clearTimeout(idle.current)
    idle.current = setTimeout(() => setCollapsed(true), IDLE_MS)
  }
  useEffect(() => {
    if (collapsed) return
    armIdle()
    return () => {
      if (idle.current) clearTimeout(idle.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collapsed])

  if (collapsed) {
    return (
      <Band tone="neutral" action={<Button size="dense" variant="ghost" onClick={() => setCollapsed(false)}>{t('nag.collapsed', lang)} →</Button>}>
        {t('nag.collapsed', lang)}
      </Band>
    )
  }

  const picks = (value: string, set: (v: string) => void) => (
    <div className={styles.picks} role="group">
      {PICKS.map((p) => (
        <button
          key={p.label}
          type="button"
          className={`${styles.pick} num`}
          aria-pressed={value === String(p.value)}
          onClick={() => set(String(p.value))}
        >
          {p.label}
        </button>
      ))}
    </div>
  )

  return (
    <form action={save} className={styles.nag} onPointerDown={armIdle} onKeyDown={armIdle} onFocus={armIdle} data-week={weekStart}>
      <div className={styles.head}>
        <p className={styles.question}>{t('nag.question', lang)}</p>
        {/* The × is a genuine 44px target (design §7.8); it does the same as Skip. */}
        <button type="button" className={styles.close} aria-label={t('nag.close', lang)} formNoValidate onClick={() => void skipNag()}>
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <p className={styles.why}>{t('nag.why', lang)}</p>

      <div className={styles.fields}>
        <div className={styles.aggregator}>
          <span className={styles.aggName}>{t('nag.swiggy', lang)}</span>
          {picks(swiggy, setSwiggy)}
          <Field id={ids.swiggy} label={t('nag.exact', lang)}>
            {(p) => (
              <input {...p} name="swiggy" className={`${fieldStyles.control} num`} type="text" inputMode="numeric" pattern="[0-9]*" value={swiggy} onChange={(e) => setSwiggy(e.target.value.replace(/\D/g, ''))} required />
            )}
          </Field>
        </div>
        <div className={styles.aggregator}>
          <span className={styles.aggName}>{t('nag.zomato', lang)}</span>
          {picks(zomato, setZomato)}
          <Field id={ids.zomato} label={t('nag.exact', lang)}>
            {(p) => (
              <input {...p} name="zomato" className={`${fieldStyles.control} num`} type="text" inputMode="numeric" pattern="[0-9]*" value={zomato} onChange={(e) => setZomato(e.target.value.replace(/\D/g, ''))} required />
            )}
          </Field>
        </div>
      </div>

      {state.error && <p className={styles.error}>{t('action.retry', lang)}</p>}

      <div className={styles.actions}>
        <Button size="counter" type="submit" aria-disabled={saving || undefined}>
          {saving ? t('action.saving', lang) : t('nag.save', lang)}
        </Button>
        {/* Equally legible, never greyed (design §7.8, §11.16). */}
        <Button size="counter" variant="ghost" onClick={() => void skipNag()}>
          {t('nag.skip', lang)}
        </Button>
      </div>
    </form>
  )
}
