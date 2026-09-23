import { formatISTDate } from '@/core/calendar.ts'
import { listBatches } from '@/db/repos/index.ts'
import { Button } from '@/ui/Button.tsx'
import { currentOutlet } from '../../_lib/session.ts'
import { PageHead, Panel } from '../bits.tsx'
import dash from '../dashboard.module.css'
import { BatchForm } from './BatchForm.tsx'

export const metadata = { title: 'Cards — ServeLine' }

/**
 * Build Spec §7 "Cards and codes": generate a batch, download it, see redemptions per batch.
 * "Download the PDF" is the print page plus the browser's print-to-PDF (see the print route).
 */
export default async function CardsPage() {
  const { restaurant, session } = await currentOutlet()
  const batches = await listBatches(restaurant.id)

  return (
    <div className={dash.page}>
      <PageHead
        title="Direct Order Cards"
        meta="A card goes in every aggregator delivery: “Order direct next time, 10% off.” The customer scans it, claims the code, and the second order is yours without commission. One redemption per phone per restaurant."
      />

      {session.role === 'owner' ? (
        <Panel title="New batch">
          <BatchForm />
        </Panel>
      ) : (
        <p className={dash.hint}>Generating a batch is the owner&rsquo;s call. You can print existing batches.</p>
      )}

      <Panel title="Batches">
        {batches.length === 0 ? (
          <p className={dash.hint}>No batches yet. Generate one above and print it.</p>
        ) : (
          /* This was a <ul> of hand-drawn grid rows — a second table skin beside /today's and
             /billing's. It is the same tabular data, so it is the same table. */
          <div className={dash.tableWrap}>
            <table className={dash.table}>
              <thead>
                <tr>
                  <th>Cards</th>
                  <th>Generated</th>
                  <th className={dash.right}>Redeemed</th>
                  <th>Placement</th>
                  <th><span className="sr-only">Print</span></th>
                </tr>
              </thead>
              <tbody>
                {batches.map((b) => (
                  <tr key={b.id}>
                    <td className="num">{b.qty}</td>
                    <td className={`${dash.nowrap} num`}>{formatISTDate(b.createdAt)}</td>
                    <td className={`${dash.right} num`}>{b.redemptionCount}</td>
                    <td className={dash.muted}>
                      {b.placedAt ? `Placed ${formatISTDate(b.placedAt)}` : 'Not yet placed'}
                      {b.placementAuditedAt ? ` · audited ${formatISTDate(b.placementAuditedAt)}` : ''}
                    </td>
                    <td className={dash.right}>
                      <Button size="counter" variant="ghost" href={`/app/cards/${b.id}/print`}>Print</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  )
}
