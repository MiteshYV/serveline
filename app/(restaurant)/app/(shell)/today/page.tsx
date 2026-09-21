import { estimateInvoice, CALL_ALLOWANCE } from '@/core/billing.ts'
import { istDate, istMonthStart, istMondayOf, istDateStart } from '@/core/calendar.ts'
import { formatINR, paise } from '@/core/money.ts'
import {
  channelOrderValue, countAllowanceCalls, deliveredCount, externalOrdersBetween, ordersByChannel, topCustomers, topDishes,
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

/** Build Spec §12: delivered ÷ (delivered + aggregator). Null when there is nothing to divide. */
const share = (direct: number, external: number): number | null =>
  direct + external === 0 ? null : Math.round((direct / (direct + external)) * 100)

const pct = (n: number | null) => (n === null ? '—' : `${n}%`)

/**
 * Build Spec §7 "Today and this month". Every number here is a Build Spec §12 definition read
 * from repos/dashboard.ts; the page does no arithmetic of its own beyond the share ratio.
 * Admin page: English only at M1 (see i18n-dashboard.ts).
 */
export default async function TodayPage() {
  const { outlet } = await currentOutlet()
  const now = new Date()
  const today = istDateStart(istDate(now))
  const monthStart = istMonthStart(now)
  const lastMonthStart = istMonthStart(now, 1)
  const weekStart = istDateStart(istMondayOf(now))

  const [byChannelToday, byChannelMonth, deliveredMonth, deliveredLast, extMonth, extLast, customers, dishes, channelValue, aiCalls] =
    await Promise.all([
      ordersByChannel(outlet.id, today, now),
      ordersByChannel(outlet.id, monthStart, now),
      deliveredCount(outlet.id, monthStart, now),
      deliveredCount(outlet.id, lastMonthStart, monthStart),
      externalOrdersBetween(outlet.id, istDate(monthStart), istDate(now)),
      externalOrdersBetween(outlet.id, istDate(lastMonthStart), istDate(monthStart)),
      topCustomers(outlet.id, weekStart, now),
      topDishes(outlet.id, monthStart, now),
      channelOrderValue(outlet.id, monthStart, now),
      // Ideation §10: answered telephone calls only; browser demo calls are excluded in the repo.
      countAllowanceCalls(outlet.id, monthStart, now),
    ])

  const shareMonth = share(deliveredMonth, extMonth)
  const shareLast = share(deliveredLast, extLast)
  const ordersToday = byChannelToday.reduce((n, r) => n + r.orders, 0)
  const ordersMonth = byChannelMonth.reduce((n, r) => n + r.orders, 0)
  const invoice = estimateInvoice({ aiCalls, channelValuePaise: channelValue })

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
            {shareLast === null ? 'No aggregator count for last month yet' : `Last month ${pct(shareLast)}`}
          </span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>AI calls used</span>
          <span className={`${styles.statValue} num`}>{aiCalls} / {CALL_ALLOWANCE}</span>
          <span className={styles.statNote}>Telephone calls the assistant answered this month; browser demo calls are not counted</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Estimated invoice to date</span>
          <span className={`${styles.statValue} num`}>{formatINR(invoice.totalPaise)}</span>
          <span className={styles.statNote}>Subscription plus 2% on delivered direct orders</span>
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
