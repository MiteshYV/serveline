'use client'

import { startTransition, useActionState } from 'react'
import { Band } from '@/ui/Band.tsx'
import { Button } from '@/ui/Button.tsx'
import { td, type DashKey } from '@/ui/i18n-dashboard.ts'
import { t, type Lang, type UiKey } from '@/ui/i18n.ts'
import { OtpInput, ResendOtp } from '@/ui/OtpInput.tsx'
import { PhoneInput } from '@/ui/PhoneInput.tsx'
import { loginAction, type LoginError, type LoginState } from './actions.ts'

const message = (e: LoginError, lang: Lang) =>
  e.dict === 'ui' ? t(e.key as UiKey, lang) : td(e.key as DashKey, lang)

export function LoginForm({ lang }: { lang: Lang }) {
  const [state, act, pending] = useActionState(loginAction, { step: 'phone' } as LoginState)
  const error = state.error

  // Rate limiting is a persistent band, not a field error (design §11.15): it is not something
  // the operator can fix by retyping.
  const band = error?.persistent ? <Band tone="attention">{message(error, lang)}</Band> : null
  const fieldError = error && !error.persistent ? message(error, lang) : undefined

  if (state.step === 'phone') {
    return (
      <form action={act} className="grid gap-[var(--space-24)]">
        {band}
        <input type="hidden" name="intent" value="send" />
        <PhoneInput lang={lang} error={fieldError} autoFocus />
        <Button size="counter" block type="submit" aria-disabled={pending || undefined}>
          {t('login.sendCode', lang)}
        </Button>
      </form>
    )
  }

  const resend = () => {
    const fd = new FormData()
    fd.set('intent', 'send')
    fd.set('phone', state.phone)
    startTransition(() => act(fd))
  }
  const back = () => {
    const fd = new FormData()
    fd.set('intent', 'back')
    startTransition(() => act(fd))
  }

  return (
    <form action={act} className="grid gap-[var(--space-24)]">
      {band}
      {/* VENDOR_MODE=mock: the code is shown on screen so a demo needs no handset (M1 design, "Adapters"). */}
      {state.devCode && <Band tone="neutral">{td('login.devCode', lang, { code: state.devCode })}</Band>}
      <input type="hidden" name="intent" value="verify" />
      <input type="hidden" name="phone" value={state.phone} />
      <input type="hidden" name="challenge" value={state.challenge} />
      <OtpInput
        lang={lang}
        hint={t('otp.help', lang, { phone: state.phone.slice(3) })}
        error={fieldError}
        autoFocus
      />
      <Button size="counter" block type="submit" aria-disabled={pending || undefined}>
        {pending ? t('otp.verifying', lang) : t('otp.verify', lang)}
      </Button>
      <div className="flex flex-wrap items-center justify-between gap-[var(--space-12)]">
        <ResendOtp lang={lang} availableAt={state.availableAt} onResend={resend} />
        <Button variant="ghost" size="counter" onClick={back}>
          {td('login.changeNumber', lang)}
        </Button>
      </div>
    </form>
  )
}
