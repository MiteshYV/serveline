import { addDays, istDate, istMondayOf } from './calendar.ts'

/**
 * When the Monday aggregator-count prompt shows. Build Spec §7: "every Monday the dashboard asks
 * for last week's Swiggy and Zomato order counts and does not stop asking until they are
 * entered." Design §7.8 adds the manners: never during a rush, a real "Skip this week", and
 * silence for four weeks after three consecutive skips.
 *
 * Pure over plain data so the schedule can be tested without a clock or a cookie jar. The
 * dashboard supplies the cookie and the two database facts.
 */

/** The `external_order_count.week_start` the prompt asks for: the Monday of the week just ended. */
export const weekToAsk = (now: Date): string => addDays(istMondayOf(now), -7)

/**
 * ponytail: skip state lives in a per-device cookie, not a table. A second phone at the counter
 * sees the prompt again, which errs on the side of collecting the number. The upgrade is a
 * `nag_skip` column pair on `external_order_count` (or a small table) when that annoys someone.
 */
export type NagCookie = {
  /** The week (Monday) the last skip was for. */
  skippedFor?: string
  /** The IST date of the last skip — a skip hides the prompt for the rest of that day. */
  skippedOn?: string
  /** Consecutive weeks skipped. */
  streak?: number
  /** Quiet until this IST date after three consecutive skips. */
  quietUntil?: string
}

export type NagReason = 'show' | 'entered' | 'rush' | 'skipped_today' | 'quiet'

/** Design §7.8: "If ≥3 orders sit in received or preparing, defer to the next dashboard open." */
export const RUSH_THRESHOLD = 3
export const SKIPS_BEFORE_QUIET = 3
export const QUIET_DAYS = 28

export function nagDecision(input: {
  now: Date
  /** A row exists for `weekToAsk(now)`. */
  entered: boolean
  /** Orders currently received or preparing. */
  rush: number
  cookie: NagCookie | null
}): NagReason {
  if (input.entered) return 'entered'
  const today = istDate(input.now)
  const c = input.cookie
  if (c?.quietUntil && c.quietUntil > today) return 'quiet'
  if (c?.skippedOn === today) return 'skipped_today'
  if (input.rush >= RUSH_THRESHOLD) return 'rush'
  return 'show'
}

/** The cookie to write after a tap on "Skip this week". */
export function afterSkip(cookie: NagCookie | null, now: Date): NagCookie {
  const week = weekToAsk(now)
  const previous = addDays(week, -7)
  let streak: number
  if (cookie?.skippedFor === week) streak = cookie.streak ?? 1 // the same week, another day
  else if (cookie?.skippedFor === previous) streak = (cookie.streak ?? 0) + 1
  else streak = 1

  const next: NagCookie = { skippedFor: week, skippedOn: istDate(now), streak }
  if (streak >= SKIPS_BEFORE_QUIET) {
    next.quietUntil = addDays(istDate(now), QUIET_DAYS)
    next.streak = 0
  }
  return next
}
