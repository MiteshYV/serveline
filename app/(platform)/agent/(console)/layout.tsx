import { cookies } from 'next/headers'
import type { ReactNode } from 'react'
import { vendorMode } from '@/adapters/mode.ts'
import { requirePlatform } from '@/auth/session.ts'
import { Button } from '@/ui/Button.tsx'
import { ThemeToggle } from '@/ui/ThemeToggle.tsx'
import { AGENT_THEME_COOKIE, isTheme } from '@/ui/theme.ts'
import c from '../console.module.css'
import { NavLink } from './NavLink.tsx'
import { setPlatformTheme, signOut } from './actions.ts'

/**
 * Every console page sits behind `requirePlatform()` (Build Spec §8). Pages call it again for the
 * role, because a layout does not re-render on client navigation. Nothing here carries a brand
 * colour or an order-state colour: steel chrome, per design §1.
 */
export default async function ConsoleLayout({ children }: { children: ReactNode }) {
  const session = await requirePlatform()
  const chosen = (await cookies()).get(AGENT_THEME_COOKIE)?.value
  const theme = isTheme(chosen) ? chosen : 'os'
  return (
    <div className={c.shell}>
      <header className={c.nav}>
        <a href="/agent" className={c.wordmark}>
          ServeLine <small>agent console</small>
        </a>
        <nav className={c.navLinks} aria-label="Console">
          <NavLink href="/agent">Restaurants</NavLink>
          <NavLink href="/agent/calls">Calls</NavLink>
          <NavLink href="/agent/calls/simulate">Simulator</NavLink>
          {session.role === 'admin' && <NavLink href="/agent/audit">Audit log</NavLink>}
          {vendorMode() === 'mock' && <NavLink href="/agent/sms">Mock SMS inbox</NavLink>}
          <NavLink href="/agent/styleguide">Styleguide</NavLink>
        </nav>
        <div className={c.navMeta}>
          <span>{session.role}</span>
          <ThemeToggle
            action={setPlatformTheme}
            current={theme}
            size="dense"
            legend="Theme"
            labels={{ os: 'OS', light: 'Light', dark: 'Dark' }}
          />
          <form action={signOut}>
            <Button type="submit" size="dense" variant="ghost">Sign out</Button>
          </form>
        </div>
      </header>
      <main className={c.main}>{children}</main>
    </div>
  )
}
