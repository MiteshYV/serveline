import type { ReactNode } from 'react'

/** Customer ordering page: comfort density (design §4.4). Follows the OS theme (ADR 0002 §3). */
export default function CustomerLayout({ children }: { children: ReactNode }) {
  return <div data-density="comfort" className="min-h-dvh">{children}</div>
}
