import type { ReactNode } from 'react'

/**
 * Agent console: dense, desktop, mouse (design §4.4, §6.1).
 *
 * `lang="en"` because this surface alone is not translated — every string in it is hard-coded
 * English. The root layout sets `<html lang>` from the language cookie, which the ordering page
 * writes at path `/` so that one device means one language; the dashboard shares it deliberately
 * and does translate. Without this, a diner who picks Kannada on the same browser leaves the
 * console rendering English prose under `<html lang="kn">`, which is what a screen reader then
 * tries to pronounce it as. One attribute stops the leak at the surface that cannot honour it,
 * rather than narrowing a cookie the other two surfaces rely on.
 */
export default function PlatformLayout({ children }: { children: ReactNode }) {
  return <div data-density="dense" lang="en" className="min-h-dvh">{children}</div>
}
