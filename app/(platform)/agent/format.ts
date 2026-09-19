import { formatINR, paise } from '@/core/money.ts'

// CLAUDE.md: stored in UTC, rendered in Asia/Kolkata. 24-hour, because the console is a work tool.
const ist = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
})

export const fmtIst = (d: Date | null | undefined): string => (d ? ist.format(d) : '—')

export const inr = (p: number): string => formatINR(paise(p))

/** Enough of a uuid to tell rows apart on a page; the full id is in the link or the audit row. */
export const shortId = (id: string): string => id.slice(0, 8)

/** The mock inbox holds the number in memory as a provider console would; the page shows only the tail. */
export const maskPhone = (e164: string): string => `${e164.slice(0, 3)} •••••• ${e164.slice(-4)}`

export const capitalise = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)
