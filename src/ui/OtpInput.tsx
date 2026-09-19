'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Field } from './Field.tsx'
import fieldStyles from './Field.module.css'
import { t, type Lang } from './i18n.ts'
import { formatDuration } from './time.ts'
import styles from './OtpInput.module.css'

type Props = {
  lang: Lang
  id?: string
  name?: string
  label?: ReactNode
  hint?: ReactNode
  /** "That code did not match…". The digits stay; they are selected so a retype overwrites. */
  error?: ReactNode
  autoFocus?: boolean
  /** The digits to show again after a failed verify: React resets a form after its action runs. */
  defaultValue?: string
}

/**
 * Design §7.6: ONE input, not six boxes — six boxes break `one-time-code` autofill, paste, and
 * screen readers. 24px tabular digits, 0.4em tracking (Latin digits only, so legal), centred.
 *
 * WebOTP: on Android the SMS fills the field with no typing. It only fills — the customer still
 * taps Verify, because silent submission on a mistyped digit is disorienting (§7.6).
 */
export function OtpInput({ lang, id = 'otp', name = 'code', label, hint, error, autoFocus, defaultValue }: Props) {
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // Feature-detected: only Chromium on Android has it. Everyone else types.
    if (typeof window === 'undefined' || !('OTPCredential' in window)) return
    const ac = new AbortController()
    navigator.credentials
      .get({ otp: { transport: ['sms'] }, signal: ac.signal } as CredentialRequestOptions)
      .then((cred) => {
        const code = (cred as { code?: string } | null)?.code
        if (code && ref.current) ref.current.value = code
      })
      .catch(() => {
        /* aborted, dismissed or unsupported — the user types */
      })
    return () => ac.abort()
  }, [])

  // An error never clears the field (§7.6): keep the digits, select-all so a retype overwrites.
  useEffect(() => {
    if (error) ref.current?.select()
  }, [error])

  return (
    <Field id={id} label={label ?? t('otp.label', lang)} hint={hint} error={error}>
      {(input) => (
        <input
          {...input}
          ref={ref}
          className={`${fieldStyles.control} ${styles.otp} num`}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          pattern="[0-9]{6}"
          name={name}
          defaultValue={defaultValue}
          autoFocus={autoFocus}
          required
        />
      )}
    </Field>
  )
}

/**
 * Design §7.6: a text button, disabled with a live countdown ("Resend in 0:24"), enabled at
 * zero. `availableAt` is an epoch ms the page computes when it issues the OTP.
 */
export function ResendOtp({
  lang,
  availableAt,
  onResend,
}: {
  lang: Lang
  availableAt: number
  onResend: () => void | Promise<void>
}) {
  const [now, setNow] = useState(() => Date.now())
  const remaining = availableAt - now

  useEffect(() => {
    if (remaining <= 0) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [remaining])

  const ready = remaining <= 0
  return (
    <button
      type="button"
      className={styles.resend}
      disabled={!ready}
      onClick={() => void onResend()}
      suppressHydrationWarning
    >
      {ready ? t('otp.resend', lang) : t('otp.resendIn', lang, { time: formatDuration(remaining, { padMinutes: false }) })}
    </button>
  )
}
