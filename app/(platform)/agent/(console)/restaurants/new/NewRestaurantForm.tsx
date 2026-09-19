'use client'

import { Band } from '@/ui/Band.tsx'
import { Button } from '@/ui/Button.tsx'
import { Field } from '@/ui/Field.tsx'
import { Panel } from '../../../bits.tsx'
import c from '../../../console.module.css'
import { useFormAction } from '../../../useFormAction.ts'
import { BrandColourField } from './BrandColourField.tsx'
import { createRestaurantAction, type NewRestaurantState } from './actions.ts'

const LANGS = [['hi', 'Hindi'], ['en', 'English'], ['kn', 'Kannada']] as const

export function NewRestaurantForm() {
  const { state, pending, onSubmit } = useFormAction<NewRestaurantState>(createRestaurantAction, {})
  const err = (k: string) => state.errors?.[k]
  const invalid = (k: string) => (err(k) ? (true as const) : undefined)

  return (
    <form onSubmit={onSubmit} className="grid gap-[var(--space-24)] max-w-[880px]">
      {state.error && <Band tone="attention">{state.error}</Band>}

      <Panel title="Restaurant">
        <div className={c.formGrid}>
          <Field id="name" label="Name" error={err('name')}>
            {(p) => <input {...p} name="name" className={c.input} autoFocus required maxLength={80} />}
          </Field>
          <Field id="slug" label="Slug" hint="The ordering page is /r/{slug}. Lowercase, hyphens." error={err('slug')}>
            {(p) => <input {...p} name="slug" className={`${c.input} num`} required maxLength={64} pattern="[a-z0-9-]+" spellCheck={false} />}
          </Field>
          <BrandColourField defaultValue="#1F6F5C" error={err('brandColour')} />
          <Field id="trialCallLimit" label="Trial call limit" hint="Ideation §10: 150 AI calls or 30 days, whichever first." error={err('trialCallLimit')}>
            {(p) => <input {...p} name="trialCallLimit" className={`${c.input} num`} inputMode="numeric" defaultValue={150} />}
          </Field>
        </div>
      </Panel>

      <Panel title="First outlet">
        <div className={c.formGrid}>
          <Field id="outletName" label="Outlet name" error={err('outletName')}>
            {(p) => <input {...p} name="outletName" className={c.input} defaultValue="Main" required />}
          </Field>
          <Field id="addressLine" label="Address line" error={err('addressLine')}>
            {(p) => <input {...p} name="addressLine" className={c.input} required />}
          </Field>
          <Field id="area" label="Area" error={err('area')}>
            {(p) => <input {...p} name="area" className={c.input} required />}
          </Field>
          <Field id="pincode" label="Pincode" error={err('pincode')}>
            {(p) => <input {...p} name="pincode" className={`${c.input} num`} inputMode="numeric" pattern="[0-9]{6}" required />}
          </Field>
          <Field id="displayPhone" label="Display phone" hint="The number printed on the packaging. Optional." error={err('displayPhone')}>
            {(p) => <input {...p} name="displayPhone" type="tel" inputMode="numeric" className={`${c.input} num`} />}
          </Field>
        </div>
        <div className="flex flex-wrap gap-[var(--space-24)]">
          <label className={c.check}>
            <input type="checkbox" name="codEnabled" defaultChecked /> Cash on delivery
          </label>
          <fieldset className="m-0 p-0 border-0 flex flex-wrap gap-[var(--space-16)]" aria-invalid={invalid('languages')}>
            <legend className={c.muted}>Languages</legend>
            {LANGS.map(([code, label]) => (
              <label key={code} className={c.check}>
                <input type="checkbox" name="languages" value={code} defaultChecked /> {label}
              </label>
            ))}
          </fieldset>
        </div>
        {err('languages') && <p className={c.fieldError}>{err('languages')}</p>}
      </Panel>

      <Panel title="Owner">
        <div className={c.formGrid}>
          <Field id="ownerName" label="Name" error={err('ownerName')}>
            {(p) => <input {...p} name="ownerName" className={c.input} required />}
          </Field>
          <Field id="ownerPhone" label="Mobile" hint="10 digits; +91 is added. Also the outlet's failover and handoff number until settings change it." error={err('ownerPhone')}>
            {(p) => <input {...p} name="ownerPhone" type="tel" inputMode="numeric" className={`${c.input} num`} required />}
          </Field>
        </div>
      </Panel>

      <div className={c.actions}>
        <Button type="submit" size="dense" disabled={pending}>{pending ? 'Creating…' : 'Create restaurant'}</Button>
        <Button href="/agent" size="dense" variant="ghost">Cancel</Button>
      </div>
    </form>
  )
}
