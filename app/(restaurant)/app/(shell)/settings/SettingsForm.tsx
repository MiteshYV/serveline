'use client'

import { useActionState } from 'react'
import { Band } from '@/ui/Band.tsx'
import { Button } from '@/ui/Button.tsx'
import { Field } from '@/ui/Field.tsx'
import fieldStyles from '@/ui/Field.module.css'
import { PhoneInput } from '@/ui/PhoneInput.tsx'
import { Panel } from '../bits.tsx'
import dash from '../dashboard.module.css'
import { saveSettings, type SettingsState } from './actions.ts'
import styles from './Settings.module.css'

export type SettingsValues = {
  hours: Record<string, string>
  holidayDates: string
  deliveryRadiusKm: string
  serviceablePincodes: string
  codEnabled: boolean
  ownerMobile: string
  handoffNumber: string
  languages: string[]
}

const DAYS: [string, string][] = [['mon', 'Monday'], ['tue', 'Tuesday'], ['wed', 'Wednesday'], ['thu', 'Thursday'], ['fri', 'Friday'], ['sat', 'Saturday'], ['sun', 'Sunday']]

export function SettingsForm({ values }: { values: SettingsValues }) {
  const [state, act, pending] = useActionState(saveSettings, {} as SettingsState)
  const err = (k: string) => state.fieldErrors?.[k]

  return (
    <form action={act} className={dash.form}>
      {state.saved && <Band tone="neutral">Saved</Band>}
      {state.error && <Band tone="attention">{state.error}</Band>}

      <Panel as="fieldset" title="Hours">
        <p className={dash.hint}>Opening spans in IST, like <span className="num">07:00-15:30, 18:30-22:30</span>. Leave a day blank if closed.</p>
        {DAYS.map(([key, label]) => (
          <Field key={key} id={`hours-${key}`} label={label} error={err(`hours.${key}`)}>
            {(p) => <input {...p} name={`hours.${key}`} className={`${fieldStyles.control} num`} type="text" defaultValue={values.hours[key] ?? ''} />}
          </Field>
        ))}
        <Field id="holidayDates" label="Holidays" hint="Dates as YYYY-MM-DD, one per line or comma-separated." error={err('holidayDates')}>
          {(p) => <textarea {...p} name="holidayDates" className={`${fieldStyles.control} ${styles.textarea} num`} rows={3} defaultValue={values.holidayDates} />}
        </Field>
      </Panel>

      <Panel as="fieldset" title="Delivery">
        <Field id="deliveryRadiusKm" label="Delivery radius (km)" error={err('deliveryRadiusKm')}>
          {(p) => <input {...p} name="deliveryRadiusKm" className={`${fieldStyles.control} num`} type="text" inputMode="decimal" defaultValue={values.deliveryRadiusKm} />}
        </Field>
        <Field id="serviceablePincodes" label="Pincodes served" hint="Six digits each, comma-separated. The ordering page refuses any other pincode." error={err('serviceablePincodes')}>
          {(p) => <textarea {...p} name="serviceablePincodes" className={`${fieldStyles.control} ${styles.textarea} num`} rows={2} defaultValue={values.serviceablePincodes} />}
        </Field>
        <label className={dash.check}><input type="checkbox" name="codEnabled" defaultChecked={values.codEnabled} /> Cash on delivery</label>
      </Panel>

      <Panel as="fieldset" title="Phones">
        <PhoneInput id="ownerMobile" name="ownerMobile" label="Owner mobile" defaultValue={values.ownerMobile} required={false} lang="en" error={err('ownerMobile')} />
        <PhoneInput id="handoffNumber" name="handoffNumber" label="Handoff number" defaultValue={values.handoffNumber} required={false} lang="en" error={err('handoffNumber')} />
        <p className={dash.hint}>The handoff number is where the AI transfers a call it cannot finish (M2). The owner mobile is where the carrier sends calls if the AI does not answer.</p>
      </Panel>

      <Panel as="fieldset" title="Languages">
        {err('languages') && <p className={dash.error}>{err('languages')}</p>}
        {(['hi', 'en', 'kn'] as const).map((l) => (
          <label key={l} lang={l} className={dash.check}>
            <input type="checkbox" name="languages" value={l} defaultChecked={values.languages.includes(l)} />
            {l === 'hi' ? 'हिन्दी' : l === 'en' ? 'English' : 'ಕನ್ನಡ'}
          </label>
        ))}
      </Panel>

      <Button size="counter" type="submit" aria-disabled={pending || undefined}>{pending ? 'Saving…' : 'Save settings'}</Button>
    </form>
  )
}
