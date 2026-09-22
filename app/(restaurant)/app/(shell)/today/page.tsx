import { estimateInvoice } from '@/core/billing.ts'
import { addDays, istDate, istMonthStart, istMondayOf, istDateStart } from '@/core/calendar.ts'
import { formatINR, paise } from '@/core/money.ts'
import {
  channelOrderValue, countAllowanceCalls, deliveredCount, externalWeeksBetween, ordersByChannel, topCustomers, topDishes,
} from '@/db/repos/index.ts'
import { currentOutlet } from '../../_lib/session.ts'
import settings from '../settings/Settings.module.css'
import styles from './Today.module.css'

export const metadata = { title: 'Today — ServeLine' }

const CHANNEL: Record<string, string> = {
  ai_call: 'AI call',
  page_table: 'Table QR',
  page_delivery: 'Ordering page',
  staff_manual: 'Entered by staff',
}

/**
 * Build Spec §12: delivered ÷ (delivered + aggregator), over the SAME weeks on both sides.
 *
 * The owner types aggregator counts in whole weeks (Ideation §9); ServeLine knows its own orders to
 * the minute. Dividing a month of direct orders by whichever weeks began inside that month compares
 * a long period against a short one, and early in a month it printed 100% — the restaurant's best
 * possible number, on no evidence. So the window is the weeks that have been entered, and the
 * direct count is taken over exactly those weeks.
 *
 * Null when no week has been entered: there is no denominator, and a made-up one is worse than a
 * dash and the prompt to enter it.
 */
const share = (direct: number, external: number, weeks: number): number | null =>
  weeks === 0 ? null : Math.round((direct / (direct + external)) * 100)

/** The instant span covered by a set of aggregator weeks: their first Monday to the last Sunday's end. */
function weekSpan(weeks: { weekStart: string }[]): { from: Date; to: Date } | null {
  const starts = weeks.map((w) => w.weekStart).sort()
  const first = starts[0]
  const last = starts[starts.length - 1]
  if (!first || !last) return null
  return { from: istDateStart(first), to: istDateStart(addDays(last, 7)) }
}

const pct = (n: number | null) => (n === null ? '—' : `${n}%`)

/**
 * Build Spec §7 "Today and this month". Every number here is a Build Spec §12 definition read
 * from repos/dashboard.ts; the page does no arithmetic of its own beyond the share ratio.
 * Admin page: English only at M1 (see i18n-dashboard.ts).
 */
export default async function TodayPage() {
  const { restaurant, outlet } = await currentOutlet()
  const now = new Date()
  const today = istDateStart(istDate(now))
  const monthStart = istMonthStart(now)
  const lastMonthStart = istMonthStart(now, 1)
  const weekStart = istDateStart(istMondayOf(now))

  const [byChannelToday, byChannelMonth, extMonth, extLast, customers, dishes, channelValue, aiCalls] =
    await Promise.all([
      ordersByChannel(outlet.id, today, now),
      ordersByChannel(outlet.id, monthStart, now),
      externalWeeksBetween(outlet.id, istDate(monthStart), istDate(now)),
      externalWeeksBetween(outlet.id, istDate(lastMonthStart), istDate(monthStart)),
      topCustomers(outlet.id, weekStart, now),
      topDishes(outlet.id, monthStart, now),
      channelOrderValue(outlet.id, monthStart, now),
      // Ideation §10: answered telephone calls only; browser demo calls are excluded in the repo.
      countAllowanceCalls(outlet.id, monthStart, now),
    ])

  // Counted over the weeks the owner entered, so the two sides of the ratio span the same days.
  const monthSpan = weekSpan(extMonth)
  const lastSpan = weekSpan(extLast)
  const [directThisSpan, directLastSpan] = await Promise.all([
    monthSpan ? deliveredCount(outlet.id, monthSpan.from, monthSpan.to) : Promise.resolve(0),
    lastSpan ? deliveredCount(outlet.id, lastSpan.from, lastSpan.to) : Promise.resolve(0),
  ])
  const shareMonth = share(directThisSpan, extMonth.reduce((n, w) => n + w.orders, 0), extMonth.length)
  const shareLast = share(directLastSpan, extLast.reduce((n, w) => n + w.orders, 0), extLast.length)
  const ordersToday = byChannelToday.reduce((n, r) => n + r.orders, 0)
  const ordersMonth = byChannelMonth.reduce((n, r) => n + r.orders, 0)
  // Finding trial-invoice-charges-subscription: a trialing restaurant owes no subscription and
  // has its own call allowance (Build Spec §13). `status === 'trialing'` means the period to date
  // is entirely inside the trial, which is the only case the Spec decides.
  const invoice = estimateInvoice({
    aiCalls,
    channelValuePaise: channelValue,
    trialing: restaurant.status === 'trialing',
    trialCallLimit: restaurant.trialCallLimit,
  })

  return (
    <div className={settings.page}>
      <h1 className={settings.title}>Today and this month</h1>

      <div className={styles.grid}>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Orders today</span>
          <span className={`${styles.statValue} num`}>{ordersToday}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Orders this month</span>
          <span className={`${styles.statValue} num`}>{ordersMonth}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Direct Order Share</span>
          <span className={`${styles.statValue} num`}>{pct(shareMonth)}</span>
          <span className={styles.statNote}>
            {shareMonth === null
              ? 'Enter last week\u2019s aggregator counts to see this'
              : `Over the ${extMonth.length} week${extMonth.length === 1 ? '' : 's'} you have entered${shareLast === null ? '' : ` \u00b7 last month ${pct(shareLast)}`}`}
          </span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>AI calls used</span>
          <span className={`${styles.statValue} num`}>{aiCalls} / {invoice.allowance}</span>
          <span className={styles.statNote}>Telephone calls the assistant answered this month; browser demo calls are not counted</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Estimated invoice to date</span>
          <span className={`${styles.statValue} num`}>{formatINR(invoice.totalPaise)}</span>
          <span className={styles.statNote}>
            {restaurant.status === 'trialing'
              ? '2% on delivered direct orders; the subscription is free during the trial'
              : 'Subscription plus 2% on delivered direct orders'}
          </span>
        </div>
      </div>

      {shareMonth === null && (
        <p className={settings.hint}>
          Direct Order Share needs last week&rsquo;s Swiggy and Zomato counts — the Monday prompt on the board asks for them.
        </p>
      )}

      <section className={settings.fieldset}>
        <h2 className={settings.legend} style={{ margin: 0 }}>Orders by channel</h2>
        <table className={styles.table}>
          <thead>
            <tr><th>Channel</th><th className={styles.right}>Today</th><th className={styles.right}>This month</th><th className={styles.right}>Value this month</th></tr>
          </thead>
          <tbody>
            {byChannelMonth.length === 0 && byChannelToday.length === 0 ? (
              <tr><td colSpan={4}>No orders yet this month.</td></tr>
            ) : (
              Object.keys(CHANNEL).map((ch) => {
                const t = byChannelToday.find((r) => r.channel === ch)
                const m = byChannelMonth.find((r) => r.channel === ch)
                if (!t && !m) return null
                return (
                  <tr key={ch}>
                    <td>{CHANNEL[ch]}</td>
                    <td className={`${styles.right} num`}>{t?.orders ?? 0}</td>
                    <td className={`${styles.right} num`}>{m?.orders ?? 0}</td>
                    <td className={`${styles.right} num`}>{formatINR(paise(m?.valuePaise ?? 0))}</td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </section>

      <section className={settings.fieldset}>
        <h2 className={settings.legend} style={{ margin: 0 }}>Top customers this week</h2>
        {customers.length === 0 ? (
          <p className={settings.hint}>No orders linked to a customer profile yet this week.</p>
        ) : (
          <table className={styles.table}>
            <thead><tr><th>Customer</th><th className={styles.right}>Orders</th><th className={styles.right}>Value</th></tr></thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.customerId}>
                  <td>{c.name ?? c.phone}</td>
                  <td className={`${styles.right} num`}>{c.orders}</td>
                  <td className={`${styles.right} num`}>{formatINR(paise(c.valuePaise))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className={settings.fieldset}>
        <h2 className={settings.legend} style={{ margin: 0 }}>Top dishes this month</h2>
        {dishes.length === 0 ? (
          <p className={settings.hint}>Nothing ordered yet this month.</p>
        ) : (
          <table className={styles.table}>
            <thead><tr><th>Dish</th><th className={styles.right}>Plates</th></tr></thead>
            <tbody>
              {dishes.map((d) => (
                <tr key={d.itemId}><td>{d.name}</td><td className={`${styles.right} num`}>{d.qty}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
