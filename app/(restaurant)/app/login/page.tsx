import { redirect } from 'next/navigation'
import { getSession } from '@/auth/session.ts'
import { td } from '@/ui/i18n-dashboard.ts'
import { readLang } from '../_lib/prefs.ts'
import { LoginForm } from './LoginForm.tsx'

export const metadata = { title: 'Sign in — ServeLine' }

/** Build Spec §7: phone OTP login for staff_user. Outside the (shell) group, so no session gate. */
export default async function LoginPage() {
  const session = await getSession('staff')
  if (session?.restaurantId) redirect('/app')
  const lang = await readLang()
  return (
    <main lang={lang} className="mx-auto w-full max-w-[420px] px-[var(--space-16)] py-[var(--space-40)] grid gap-[var(--space-32)]">
      <header className="grid gap-[var(--space-4)]">
        <span style={{ fontSize: 'var(--text-caption)', color: 'var(--text-tertiary)', fontWeight: 'var(--fw-bold)' }}>ServeLine</span>
        <h1 className="m-0" style={{ fontSize: 'var(--text-display)', fontWeight: 'var(--fw-bold)', lineHeight: 'var(--lh-tight)' }}>
          {td('login.counter', lang)}
        </h1>
      </header>
      <LoginForm lang={lang} />
    </main>
  )
}
