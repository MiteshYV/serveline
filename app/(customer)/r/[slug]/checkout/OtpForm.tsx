'use client'

import { useActionState, useTransition } from 'react'
import { Band } from '@/ui/Band.tsx'
import { Button } from '@/ui/Button.tsx'
import { t, type Lang } from '@/ui/i18n.ts'
import { OtpInput, ResendOtp } from '@/ui/OtpInput.tsx'
import { sendCode, verifyCode, type VerifyState } from './actions.ts'
import styles from '../customer.module.css'

/** Design §7.6: resend is enabled after 30 s. */
const RESEND_AFTER_MS = 30_000

type Props = {
  slug: string
  qs: string
  lang: Lang
  /** The local ten digits, for "Sent by SMS to +91 …". */
  phoneLocal: string
  /** Present only under VENDOR_MODE=mock: shown in a small band so a demo needs no handset. */
  devCode?: string
  issuedAt: number
}

export function OtpForm({ slug, qs, lang, phoneLocal, devCode, issuedAt }: Props) {
  const [state, action, pending] = useActionState<VerifyState, FormData>(verifyCode, { error: null, attempt: 0, code: '' })
  const [resending, startResend] = useTransition()

  function resend() {
    const fd = new FormData()
    fd.set('slug', slug)
    fd.set('qs', qs)
    startResend(() => sendCode(fd))
  }

  return (
    <form action={action} className={styles.form}>
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="qs" value={qs} />
      {devCode && (
        <Band tone="neutral" className={styles.demo}>{t('checkout.demoCode', lang, { code: devCode })}</Band>
      )}
      <OtpInput
        key={state.attempt}
        lang={lang}
        hint={t('otp.help', lang, { phone: phoneLocal })}
        error={state.error ? t(state.error, lang) : undefined}
        defaultValue={state.code}
        autoFocus
      />
      <Button type="submit" variant="brand" size="counter" block disabled={pending}>
        {pending ? t('otp.verifying', lang) : t('otp.verify', lang)}
      </Button>
      <div>
        <ResendOtp lang={lang} availableAt={issuedAt + RESEND_AFTER_MS} onResend={resend} />
        {resending && <span className={styles.optionMeta}> {t('action.saving', lang)}</span>}
      </div>
    </form>
  )
}
