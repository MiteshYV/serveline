import { redirect } from 'next/navigation'
import { getSession } from '@/auth/session.ts'
import { PageHead } from '../bits.tsx'
import c from '../console.module.css'
import { LoginForm } from './LoginForm.tsx'

export const metadata = { title: 'Sign in — ServeLine agent console' }

/** Build Spec §8: `platform_user` login. A live platform session skips straight to the console. */
export default async function AgentLoginPage() {
  if (await getSession('platform')) redirect('/agent')
  return (
    <main className={c.login}>
      <div className={c.loginCard}>
        <PageHead
          crumbs="ServeLine · agent console"
          title="Sign in"
          meta="Agents and admins only. A code is sent by SMS to your registered mobile."
        />
        <LoginForm />
      </div>
    </main>
  )
}
