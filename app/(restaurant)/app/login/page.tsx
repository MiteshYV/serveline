import { redirect } from 'next/navigation'
import { getSession } from '@/auth/session.ts'
import { Band } from '@/ui/Band.tsx'
import { Button } from '@/ui/Button.tsx'
import { td } from '@/ui/i18n-dashboard.ts'
import { signOut } from '../(shell)/actions.ts'
import { readLang } from '../_lib/prefs.ts'
import { LoginForm } from './LoginForm.tsx'
import styles from './Login.module.css'

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
      <main lang={lang} className={styles.page}>
        <Band tone="neutral">{td('login.suspended', lang)}</Band>
        <form action={signOut}>
          <Button size="counter" variant="ghost" type="submit">{td('login.signOut', lang)}</Button>
        </form>
      </main>
    )
  }
  return (
    <main lang={lang} className={styles.page}>
      <header className={styles.head}>
        <span className={styles.wordmark}>ServeLine</span>
        <h1 className={styles.title}>{td('login.counter', lang)}</h1>
      </header>
      <LoginForm lang={lang} />
    </main>
  )
}
