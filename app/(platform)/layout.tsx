import type { ReactNode } from 'react'

/** Agent console: dense, desktop, mouse (design §4.4, §6.1). */
export default function PlatformLayout({ children }: { children: ReactNode }) {
  return <div data-density="dense" className="min-h-dvh">{children}</div>
}
