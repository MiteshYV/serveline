import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { addDays, istDate, istDayStart, istDateStart, istMondayOf, istMonthStart, msToNextIstDayStart } from './calendar.ts'

describe('calendar (IST)', () => {
  // 2026-09-18 20:00 UTC is 2026-09-19 01:30 IST — a different calendar day.
  const lateUtc = new Date('2026-09-18T20:00:00Z')

  it('puts a late-UTC instant on the next IST day', () => {
    assert.equal(istDate(lateUtc), '2026-09-19')
    assert.equal(istDayStart(lateUtc).toISOString(), '2026-09-18T18:30:00.000Z')
    assert.equal(istDateStart('2026-09-19').toISOString(), '2026-09-18T18:30:00.000Z')
  })

  it('cuts weeks on IST Mondays', () => {
    // 2026-09-19 is a Saturday in IST; its week began Monday 2026-09-14.
    assert.equal(istMondayOf(lateUtc), '2026-09-14')
    // Sunday 23:00 IST is still that week; 00:30 IST Monday is the next.
    assert.equal(istMondayOf(new Date('2026-09-20T17:30:00Z')), '2026-09-14')
    assert.equal(istMondayOf(new Date('2026-09-20T19:00:00Z')), '2026-09-21')
    assert.equal(addDays('2026-09-14', -7), '2026-09-07')
  })

  // Finding orders-today-never-resets-at-midnight: the board's "N orders today" timer is armed
  // from this, so it has to land on the IST boundary and never on zero or a negative delay.
  it('counts down to the next IST midnight', () => {
    // 01:30 IST on the 19th: 22h30m of that IST day remain.
    assert.equal(msToNextIstDayStart(lateUtc), (22 * 60 + 30) * 60_000)
    // Exactly at an IST midnight, a whole day remains — never 0, which would spin a timer.
    assert.equal(msToNextIstDayStart(new Date('2026-09-18T18:30:00Z')), 86_400_000)
    // One millisecond before it, one millisecond remains.
    assert.equal(msToNextIstDayStart(new Date('2026-09-18T18:29:59.999Z')), 1)
    // Firing at the delay lands on the next IST date, whatever the host's own timezone.
    const fired = new Date(lateUtc.getTime() + msToNextIstDayStart(lateUtc))
    assert.equal(istDate(fired), '2026-09-20')
  })

  it('cuts months on IST and can step back', () => {
    assert.equal(istMonthStart(lateUtc).toISOString(), '2026-08-31T18:30:00.000Z')
    assert.equal(istMonthStart(lateUtc, 1).toISOString(), '2026-07-31T18:30:00.000Z')
    // January steps back into the previous year.
    assert.equal(istMonthStart(new Date('2026-01-15T00:00:00Z'), 1).toISOString(), '2025-11-30T18:30:00.000Z')
  })
})
