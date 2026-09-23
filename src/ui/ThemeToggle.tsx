import { Button, type Size } from './Button.tsx'
import { THEMES, type Theme } from './theme.ts'

type Props = {
  /** The server action that writes this surface's theme cookie. */
  action: (form: FormData) => void | Promise<void>
  /** What is set now. `os` means no cookie, which is what lets the OS decide. */
  current: Theme
  /** Touch target: `counter` on the dashboard, `dense` in the agent console. */
  size: Extract<Size, 'counter' | 'dense'>
  /** Translated. The console passes English; the dashboard passes the owner's language. */
  labels: Record<Theme, string>
  /** Names the group for a screen reader — "Theme", translated. */
  legend: string
}

/**
 * The staff light/dark control, ADR 0002 §3.
 *
 * A form of three submit buttons rather than a client component with state. Three reasons, and
 * the first is the one that matters: the choice has to survive a reload, which means it has to be
 * a cookie the server reads before it renders `<html data-theme>` — anything that sets
 * `document.documentElement.dataset` is undone by the next navigation. It also means the control
 * works with no JavaScript at all, on a counter tablet that may be running something old. And it
 * keeps the dashboard's zero-client-component budget intact.
 *
 * The pressed state is `aria-pressed`, not colour: "never colour alone".
 */
export function ThemeToggle({ action, current, size, labels, legend }: Props) {
  return (
    <form action={action}>
      <fieldset style={{ border: 0, margin: 0, padding: 0, display: 'flex', gap: 'var(--space-8)' }}>
        <legend className="sr-only">{legend}</legend>
        {THEMES.map((theme) => (
          <Button
            key={theme}
            size={size}
            type="submit"
            name="theme"
            value={theme}
            variant={current === theme ? 'primary' : 'ghost'}
            aria-pressed={current === theme}
          >
            {labels[theme]}
          </Button>
        ))}
      </fieldset>
    </form>
  )
}
