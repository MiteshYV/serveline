import { redirect } from 'next/navigation'
import { CALL_ALLOWANCE, FEE_PERCENT, OVERAGE_PER_CALL_PAISE, SUBSCRIPTION_PAISE, TRIAL_DAYS, estimateInvoice } from '@/core/billing.ts'
import { formatISTDate, istMonthStart } from '@/core/calendar.ts'
import { formatINR, paise } from '@/core/money.ts'
import { channelOrderValue } from '@/db/repos/index.ts'
import { currentOutlet } from '../../_lib/session.ts'
import settings from '../settings/Settings.module.css'
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
  const channelValue = await channelOrderValue(outlet.id, istMonthStart(now), now)
  const aiCalls = 0 // M2
  const invoice = estimateInvoice({ aiCalls, channelValuePaise: channelValue })

  const trialEnds = restaurant.trialStartedAt
    ? new Date(restaurant.trialStartedAt.getTime() + TRIAL_DAYS * 86_400_000)
    : null
  const trialDaysLeft = trialEnds ? Math.max(0, Math.ceil((trialEnds.getTime() - now.getTime()) / 86_400_000)) : null

  return (
    <div className={settings.page}>
      <h1 className={settings.title}>Billing</h1>

      <div className={today.grid}>
        <div className={today.stat}>
          <span className={today.statLabel}>Plan</span>
          <span className={today.statValue}>{STATUS[restaurant.status] ?? restaurant.status}</span>
          <span className={today.statNote}>
            {restaurant.status === 'trialing' && trialEnds
              ? `${trialDaysLeft} days left, or ${restaurant.trialCallLimit} AI calls — whichever first`
              : `${formatINR(SUBSCRIPTION_PAISE)} a month`}
          </span>
        </div>
        <div className={today.stat}>
          <span className={today.statLabel}>AI calls this month</span>
          <span className={`${today.statValue} num`}>{aiCalls} / {CALL_ALLOWANCE}</span>
          <span className={today.statNote}>{formatINR(OVERAGE_PER_CALL_PAISE)} per call beyond the allowance · from M2</span>
        </div>
        <div className={today.stat}>
          <span className={today.statLabel}>Estimated invoice</span>
          <span className={`${today.statValue} num`}>{formatINR(invoice.totalPaise)}</span>
          <span className={today.statNote}>Month to date</span>
        </div>
      </div>

      <section className={settings.fieldset}>
        <h2 className={settings.legend} style={{ margin: 0 }}>How this month adds up</h2>
        <table className={today.table}>
          <tbody>
            <tr><td>Subscription</td><td className={`${today.right} num`}>{formatINR(invoice.subscriptionPaise)}</td></tr>
            <tr>
              <td>Overage · <span className="num">{invoice.overageCalls}</span> calls beyond {CALL_ALLOWANCE}</td>
              <td className={`${today.right} num`}>{formatINR(invoice.overagePaise)}</td>
            </tr>
            <tr>
              <td>{FEE_PERCENT}% on delivered direct orders · <span className="num">{formatINR(paise(channelValue))}</span></td>
              <td className={`${today.right} num`}>{formatINR(invoice.feePaise)}</td>
            </tr>
            <tr><th>Total</th><th className={`${today.right} num`}>{formatINR(invoice.totalPaise)}</th></tr>
          </tbody>
        </table>
        <p className={settings.hint}>
          Orders entered by staff by hand carry no fee. Cancelled orders carry no fee. The fee funds the AI; the
          subscription funds the platform.
        </p>
      </section>

      <section className={settings.fieldset}>
        <h2 className={settings.legend} style={{ margin: 0 }}>Payment</h2>
        <p className={settings.hint}>
          Invoices are collected by a UPI Autopay mandate set up during onboarding, with a payment link as the
          fallback. The mandate, the monthly invoice and the usage ledger arrive with milestone M5.
        </p>
        {restaurant.trialStartedAt && (
          <p className={settings.hint}>Trial started {formatISTDate(restaurant.trialStartedAt)}.</p>
        )}
      </section>
    </div>
  )
}
