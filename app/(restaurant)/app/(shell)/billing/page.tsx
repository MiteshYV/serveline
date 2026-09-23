import { redirect } from 'next/navigation'
import { FEE_PERCENT, OVERAGE_PER_CALL_PAISE, SUBSCRIPTION_PAISE, TRIAL_DAYS, estimateInvoice } from '@/core/billing.ts'
import { formatISTDate, istMonthStart } from '@/core/calendar.ts'
import { formatINR, paise } from '@/core/money.ts'
import { channelOrderValue, countAllowanceCalls } from '@/db/repos/index.ts'
import { currentOutlet } from '../../_lib/session.ts'
import { PageHead, Panel } from '../bits.tsx'
import dash from '../dashboard.module.css'
import today from '../today/Today.module.css'

export const metadata = { title: 'Billing — ServeLine' }

const STATUS: Record<string, string> = {
  trialing: 'Free trial',
  active: 'Active',
  suspended: 'Suspended',
  churned: 'Closed',
}

/**
 * Build Spec §7 "Billing": current plan, usage, invoices, mandate status. Owner only (Build Spec
 * §10). Invoices, the ledger and the UPI Autopay mandate arrive with M5; this page says so rather
 * than showing an empty table.
 */
export default async function BillingPage() {
  const { restaurant, outlet, session } = await currentOutlet()
  if (session.role !== 'owner') redirect('/app')

  const now = new Date()
  const monthStart = istMonthStart(now)
  // Finding trial-invoice-charges-subscription: the count came from a hard-coded 0 while
  // /app/today read the real figure, so the two screens could print different invoices for the
  // same restaurant in the same minute. Both now read the same repository function.
  const [channelValue, aiCalls] = await Promise.all([
    channelOrderValue(outlet.id, monthStart, now),
    countAllowanceCalls(outlet.id, monthStart, now),
  ])
  // A trialing restaurant owes no subscription and has its own call allowance (Build Spec §13).
  const trialing = restaurant.status === 'trialing'
  const invoice = estimateInvoice({
    aiCalls,
    channelValuePaise: channelValue,
    trialing,
    trialCallLimit: restaurant.trialCallLimit,
  })

  const trialEnds = restaurant.trialStartedAt
    ? new Date(restaurant.trialStartedAt.getTime() + TRIAL_DAYS * 86_400_000)
    : null
  const trialDaysLeft = trialEnds ? Math.max(0, Math.ceil((trialEnds.getTime() - now.getTime()) / 86_400_000)) : null

  return (
    <div className={dash.page}>
      <PageHead title="Billing" />

      <div className={today.grid}>
        <div className={today.stat}>
          <span className={today.statLabel}>Plan</span>
          {/* A word, not a numeral, so it takes the 1.45 line-height floor. */}
          <span className={today.statWord}>{STATUS[restaurant.status] ?? restaurant.status}</span>
          <span className={today.statNote}>
            {trialing && trialEnds
              ? `${trialDaysLeft} days left, or ${restaurant.trialCallLimit} AI calls — whichever first`
              : `${formatINR(SUBSCRIPTION_PAISE)} a month`}
          </span>
        </div>
        <div className={today.stat}>
          <span className={today.statLabel}>AI calls this month</span>
          <span className={`${today.statValue} num`}>{aiCalls} / {invoice.allowance}</span>
          <span className={today.statNote}>
            {trialing
              ? 'Free during the trial'
              : `${formatINR(OVERAGE_PER_CALL_PAISE)} per call beyond the allowance`}
          </span>
        </div>
        <div className={today.stat}>
          <span className={today.statLabel}>Estimated invoice</span>
          <span className={`${today.statValue} num`}>{formatINR(invoice.totalPaise)}</span>
          <span className={today.statNote}>Month to date</span>
        </div>
      </div>

      <Panel title="How this month adds up">
        <div className={dash.tableWrap}>
          <table className={dash.table}>
            <tbody>
              <tr>
                <td>Subscription{trialing ? ' · free during the trial' : ''}</td>
                <td className={`${dash.right} num`}>{formatINR(invoice.subscriptionPaise)}</td>
              </tr>
              <tr>
                <td>Overage · <span className="num">{invoice.overageCalls}</span> calls beyond {invoice.allowance}</td>
                <td className={`${dash.right} num`}>{formatINR(invoice.overagePaise)}</td>
              </tr>
              <tr>
                <td>{FEE_PERCENT}% on delivered direct orders · <span className="num">{formatINR(paise(channelValue))}</span></td>
                <td className={`${dash.right} num`}>{formatINR(invoice.feePaise)}</td>
              </tr>
              <tr><th>Total</th><th className={`${dash.right} num`}>{formatINR(invoice.totalPaise)}</th></tr>
            </tbody>
          </table>
        </div>
        <p className={dash.hint}>
          Orders entered by staff by hand carry no fee. Cancelled orders carry no fee. The fee funds the AI; the
          subscription funds the platform.
        </p>
      </Panel>

      <Panel title="Payment">
        <p className={dash.hint}>
          Invoices are collected by a UPI Autopay mandate set up during onboarding, with a payment link as the
          fallback. The mandate, the monthly invoice and the usage ledger arrive with milestone M5.
        </p>
        {restaurant.trialStartedAt && (
          <p className={dash.hint}>Trial started {formatISTDate(restaurant.trialStartedAt)}.</p>
        )}
      </Panel>
    </div>
  )
}
