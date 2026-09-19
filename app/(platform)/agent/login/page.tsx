import { redirect } from 'next/navigation'
import { getSession } from '@/auth/session.ts'
import c from '../console.module.css'
import { LoginForm } from './LoginForm.tsx'

export const metadata = { title: 'Sign in — ServeLine agent console' }

/** Build Spec §8: `platform_user` login. A live platform session skips straight to the console. */
export default async function AgentLoginPage() {
  if (await getSession('platform')) redirect('/agent')
  return (
    <main className={c.login}>
      <div className={c.loginCard}>
        <header>
          <p className={c.crumbs}>ServeLine · agent console</p>
          <h1 className={c.title}>Sign in</h1>
          <p className={c.meta}>Agents and admins only. A code is sent by SMS to your registered mobile.</p>
        </header>
        <LoginForm />
      </div>
    </main>
  )
}
