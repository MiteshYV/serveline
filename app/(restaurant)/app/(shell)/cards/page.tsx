import { formatISTDate } from '@/core/calendar.ts'
import { listBatches } from '@/db/repos/index.ts'
import { Button } from '@/ui/Button.tsx'
import { currentOutlet } from '../../_lib/session.ts'
import settings from '../settings/Settings.module.css'
import { BatchForm } from './BatchForm.tsx'
import styles from './Cards.module.css'

export const metadata = { title: 'Cards — ServeLine' }

/**
 * Build Spec §7 "Cards and codes": generate a batch, download it, see redemptions per batch.
 * "Download the PDF" is the print page plus the browser's print-to-PDF (see the print route).
 */
export default async function CardsPage() {
  const { restaurant, session } = await currentOutlet()
  const batches = await listBatches(restaurant.id)

  return (
    <div className={settings.page}>
      <h1 className={settings.title}>Direct Order Cards</h1>
      <p className={settings.hint}>
        A card goes in every aggregator delivery: &ldquo;Order direct next time, 10% off.&rdquo; The customer
        scans it, claims the code, and the second order is yours without commission. One redemption per
        phone per restaurant.
      </p>

      {session.role === 'owner' ? (
        <section className={settings.fieldset}>
          <h2 className={settings.legend} style={{ margin: 0 }}>New batch</h2>
          <BatchForm />
        </section>
      ) : (
        <p className={settings.hint}>Generating a batch is the owner&rsquo;s call. You can print existing batches.</p>
      )}

      <section className={settings.fieldset}>
        <h2 className={settings.legend} style={{ margin: 0 }}>Batches</h2>
        {batches.length === 0 ? (
          <p className={settings.hint}>No batches yet. Generate one above and print it.</p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {batches.map((b) => (
              <li key={b.id} className={styles.row}>
                <div className={styles.meta}>
                  <strong><span className="num">{b.qty}</span> cards · {formatISTDate(b.createdAt)}</strong>
                  <span className={styles.muted}>
                    <span className="num">{b.redemptionCount}</span> redeemed
                    {b.placedAt ? ` · placed ${formatISTDate(b.placedAt)}` : ' · not yet placed'}
                    {b.placementAuditedAt ? ` · audited ${formatISTDate(b.placementAuditedAt)}` : ''}
                  </span>
                </div>
                <Button size="counter" variant="ghost" href={`/app/cards/${b.id}/print`}>Print</Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
