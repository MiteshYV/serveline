import type { ReactNode } from 'react'
import { Field } from './Field.tsx'
import fieldStyles from './Field.module.css'
import { t, type Lang } from './i18n.ts'
import styles from './PhoneInput.module.css'

type Props = {
  lang: Lang
  id?: string
  name?: string
  label?: ReactNode
  /** Set after a blur or submit check, never on keystroke (design §7.5). */
  error?: ReactNode
  defaultValue?: string
  autoFocus?: boolean
  required?: boolean
}

/**
 * Design §7.5. A fixed, non-editable +91 segment — never a country dropdown, this is a
 * single-market product. `type="tel"`, never `type="number"`. Ten local digits; the browser's
 * `pattern` check fires on submit and the server action re-validates with core/phone.
 *
 * Server-component-safe: no state. Blur-time validation, if a page wants it before submit,
 * is a small client wrapper that sets `error`.
 */
export function PhoneInput({
  lang,
  id = 'phone',
  name = 'phone',
  label,
  error,
  defaultValue,
  autoFocus,
  required = true,
}: Props) {
  return (
    <Field id={id} label={label ?? t('login.phone', lang)} error={error}>
      {(input) => (
        <div className={styles.wrap}>
          <span className={styles.prefix} aria-hidden="true">
            +91
          </span>
          <input
            {...input}
            className={`${fieldStyles.control} ${styles.input} num`}
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            maxLength={10}
            pattern="[6-9][0-9]{9}"
            name={name}
            defaultValue={defaultValue}
            autoFocus={autoFocus}
            required={required}
          />
        </div>
      )}
    </Field>
  )
}
