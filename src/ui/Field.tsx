import type { ReactNode } from 'react'
import styles from './Field.module.css'

/** What the wrapped control must spread onto itself so the label and the error are wired. */
export type FieldInputProps = {
  id: string
  'aria-describedby'?: string
  'aria-invalid'?: true
}

type Props = {
  id: string
  label: ReactNode
  hint?: ReactNode
  /** Design §7.10.3: shown below the field in attention ink; the field keeps its value. */
  error?: ReactNode
  /** Render the control with the a11y props applied: `{(input) => <input {...input} />}`. */
  children: (input: FieldInputProps) => ReactNode
  className?: string
}

/**
 * Design §9: every input has a persistent visible <label>; placeholders are not labels.
 * Error text sits below in `--state-attention-ink` with `aria-describedby` and `aria-invalid`.
 * Validation timing (blur and submit, never keystroke) is the caller's; this only renders.
 */
export function Field({ id, label, hint, error, children, className }: Props) {
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined

  return (
    <div className={`${styles.field}${className ? ` ${className}` : ''}`}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })}
      {hint && (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className={styles.error}>
          {error}
        </p>
      )}
    </div>
  )
}
