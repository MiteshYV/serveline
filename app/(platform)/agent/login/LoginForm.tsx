'use client'

import { Band } from '@/ui/Band.tsx'
import { Button } from '@/ui/Button.tsx'
import { OtpInput, ResendOtp } from '@/ui/OtpInput.tsx'
import { PhoneInput } from '@/ui/PhoneInput.tsx'
import { t } from '@/ui/i18n.ts'
import c from '../console.module.css'
import { useFormAction } from '../useFormAction.ts'
import { sendCode, verifyCode, type SendState, type VerifyState } from './actions.ts'

/** Phone → OTP → session. Two steps, one component, no routing between them. */
export function LoginForm() {
  const send = useFormAction<SendState>(sendCode, {})
  const verify = useFormAction<VerifyState>(verifyCode, {})
  const s = send.state

  if (!s.challenge || !s.phone) {
    return (
      <form onSubmit={send.onSubmit} className="grid gap-[var(--space-16)]">
        {s.limited && <Band tone="attention">{s.error}</Band>}
        <PhoneInput lang="en" error={s.limited ? undefined : s.error} autoFocus />
        <Button type="submit" size="customer" disabled={send.pending}>
          {send.pending ? 'Sending…' : t('login.sendCode', 'en')}
        </Button>
      </form>
    )
  }

  const phone = s.phone
  const resend = () => {
    const fd = new FormData()
    fd.set('phone', phone)
    send.submit(fd)
  }
  const v = verify.state

  return (
    <form onSubmit={verify.onSubmit} className="grid gap-[var(--space-16)]">
      <input type="hidden" name="phone" value={phone} />
      <input type="hidden" name="challenge" value={s.challenge} />
      {s.devCode && (
        <Band tone="neutral">
          Mock mode — your code is <span className="num">{s.devCode}</span>. It is also in the{' '}
          <a href="/agent/sms" className={c.link}>mock SMS inbox</a>.
        </Band>
      )}
      {v.limited && <Band tone="attention">{v.error}</Band>}
      <OtpInput
        lang="en"
        hint={t('otp.help', 'en', { phone: phone.slice(3) })}
        error={v.limited ? undefined : v.error}
        autoFocus
      />
      <Button type="submit" size="customer" disabled={verify.pending}>
        {verify.pending ? t('otp.verifying', 'en') : t('otp.verify', 'en')}
      </Button>
      <ResendOtp lang="en" availableAt={s.resendAt ?? 0} onResend={resend} />
    </form>
  )
}
