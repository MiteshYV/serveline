import { redirect } from 'next/navigation'
import { getSession } from '@/auth/session.ts'
import { Band } from '@/ui/Band.tsx'
import { Button } from '@/ui/Button.tsx'
import { td } from '@/ui/i18n-dashboard.ts'
import { signOut } from '../(shell)/actions.ts'
import { readLang } from '../_lib/prefs.ts'
import { LoginForm } from './LoginForm.tsx'

export const metadata = { title: 'Sign in — ServeLine' }

/** Build Spec §7: phone OTP login for staff_user. Outside the (shell) group, so no session gate. */
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ suspended?: string }> }) {
  const session = await getSession('staff')
  const { suspended } = await searchParams
  // currentOutlet() sends a suspended restaurant's staff here (SEC-7). Their session is still live,
  // so the usual "signed in → /app" redirect would loop; show why instead, and let them sign out.
  if (session?.restaurantId && !suspended) redirect('/app')
  const lang = await readLang()
  if (session?.restaurantId && suspended) {
    return (
      <main lang={lang} className="mx-auto w-full max-w-[420px] px-[var(--space-16)] py-[var(--space-40)] grid gap-[var(--space-24)]">
        <Band tone="neutral">{td('login.suspended', lang)}</Band>
        <form action={signOut}>
          <Button size="counter" variant="ghost" type="submit">{td('login.signOut', lang)}</Button>
        </form>
      </main>
    )
  }
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
