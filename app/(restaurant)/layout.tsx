import type { ReactNode } from 'react'

/**
 * Counter dashboard: counter density (design §4.4, §6). The manual dark toggle (ADR 0002 §3)
 * is a `data-theme` attribute on <html>, which tokens.css already honours; the dashboard sets
 * it from a small client control.
 */
export default function RestaurantLayout({ children }: { children: ReactNode }) {
  return <div data-density="counter" className="min-h-dvh">{children}</div>
}
