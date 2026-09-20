'use client'

import { useActionState } from 'react'
import { Button } from '@/ui/Button.tsx'
import { Field } from '@/ui/Field.tsx'
import fieldStyles from '@/ui/Field.module.css'
import settings from '../settings/Settings.module.css'
import { generateBatch, type BatchState } from './actions.ts'
import styles from './Cards.module.css'

export function BatchForm() {
  const [state, action, pending] = useActionState<BatchState, FormData>(generateBatch, {})
  return (
    <form action={action} className={settings.form}>
      <div className={styles.formRow}>
        <Field id="qty" label="How many cards">
          {(p) => <input {...p} name="qty" type="text" inputMode="numeric" pattern="[0-9]*" defaultValue="200" className={`${fieldStyles.control} num`} required />}
        </Field>
        <Field id="percent" label="Discount %">
          {(p) => <input {...p} name="percent" type="text" inputMode="numeric" pattern="[0-9]*" defaultValue="10" className={`${fieldStyles.control} num`} required />}
        </Field>
        <Field id="validTo" label="Valid until" hint="Leave blank for no end date">
          {(p) => <input {...p} name="validTo" type="date" className={fieldStyles.control} />}
        </Field>
      </div>
      {state.error && <p className={settings.error} role="status">{state.error}</p>}
      {state.created && <p className={settings.hint} role="status">{state.created} cards generated. Print them from the list below.</p>}
      <Button size="counter" type="submit" disabled={pending}>{pending ? 'Generating…' : 'Generate cards'}</Button>
    </form>
  )
}
