/**
 * Asia/Kolkata calendar arithmetic. Build Spec §4: timestamps are UTC, the app renders IST; the
 * Monday nag, the /today page and the order numbers all cut days, weeks and months on IST
 * boundaries. IST is UTC+5:30 with no daylight saving, so a fixed offset is exact and needs no
 * timezone database — which PGlite-in-the-browser and a `node --test` run both lack.
 */

export const IST_OFFSET_MS = 330 * 60_000

/** ISO date `YYYY-MM-DD`. */
export type IsoDate = string

const shifted = (d: Date) => new Date(d.getTime() + IST_OFFSET_MS)

/** The IST calendar date of an instant. */
export const istDate = (d: Date): IsoDate => shifted(d).toISOString().slice(0, 10)

/** The instant (UTC) at which the IST calendar day containing `d` began. */
export function istDayStart(d: Date): Date {
  const s = shifted(d)
  return new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate()) - IST_OFFSET_MS)
}

/** The instant at which the IST calendar month containing `d` began, shifted by `monthsAgo`. */
export function istMonthStart(d: Date, monthsAgo = 0): Date {
  const s = shifted(d)
  return new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth() - monthsAgo, 1) - IST_OFFSET_MS)
}

/** The IST Monday of the week containing `d`, as a date. Weeks are ISO weeks: Monday to Sunday. */
export function istMondayOf(d: Date): IsoDate {
  const s = shifted(d)
  const sinceMonday = (s.getUTCDay() + 6) % 7
  return new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate() - sinceMonday))
    .toISOString()
    .slice(0, 10)
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return new Date(new Date(`${date}T00:00:00Z`).getTime() + days * 86_400_000).toISOString().slice(0, 10)
}

/** The instant at which the IST calendar date `date` began. */
export const istDateStart = (date: IsoDate): Date => new Date(new Date(`${date}T00:00:00Z`).getTime() - IST_OFFSET_MS)

const timeFmt = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false })
const dateTimeFmt = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
const dateFmt = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' })

/** "14:05" in IST. Display only. */
export const formatISTTime = (d: Date): string => timeFmt.format(d)
/** "18 Sept, 14:05" in IST. Display only. */
export const formatISTDateTime = (d: Date): string => dateTimeFmt.format(d)
/** "18 Sept 2026" in IST. Display only. */
export const formatISTDate = (d: Date): string => dateFmt.format(d)
