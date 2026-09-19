import { notFound } from 'next/navigation'
import * as QRCode from 'qrcode'
import { listCodesForBatch } from '@/db/repos/index.ts'
import { Button } from '@/ui/Button.tsx'
import { appOrigin } from '../../../../_lib/origin.ts'
import { currentOutlet } from '../../../../_lib/session.ts'
import styles from './print.module.css'

export const metadata = { title: 'Print cards — ServeLine' }

/**
 * ponytail: the "PDF" is this page plus the browser's print dialog. No PDF library, no server
 * rendering, and the QR is an inline SVG per card. The upgrade — a real PDF from an API — is for
 * when batches go to a print shop's upload form rather than a counter printer.
 */
export default async function PrintBatchPage({ params }: { params: Promise<{ batchId: string }> }) {
  const { batchId } = await params
  const { restaurant, outlet } = await currentOutlet()
  const codes = await listCodesForBatch(batchId)
  if (codes.length === 0 || codes[0]?.restaurantId !== restaurant.id) notFound()

  const origin = await appOrigin()
  const pageUrl = `${origin}/r/${restaurant.slug}`
  const cards = await Promise.all(
    codes.map(async (c) => ({
      code: c.code,
      percent: c.percent,
      svg: await QRCode.toString(`${pageUrl}?c=${c.code}`, { type: 'svg', margin: 0, width: 96 }),
    })),
  )

  return (
    <div className={styles.sheet}>
      <div className={styles.toolbar}>
        <Button size="counter" href="/app/cards" variant="ghost">Back</Button>
        <span><span className="num">{cards.length}</span> cards — use your browser&rsquo;s Print, then &ldquo;Save as PDF&rdquo;.</span>
      </div>
      {/* @page must be global CSS; a CSS module cannot carry it. */}
      <style>{'@page { size: 90mm 55mm; margin: 0; }'}</style>
      {cards.map((c) => (
        <article key={c.code} className={styles.card}>
          <div className={styles.text}>
            <div className={styles.name}>{restaurant.name}</div>
            <div className={styles.offer}>Order direct next time — {c.percent}% off</div>
            <div className={styles.code}>{c.code}</div>
            <div className={styles.url}>{pageUrl}{outlet.displayPhone ? ` · ${outlet.displayPhone}` : ''}</div>
          </div>
          <img className={styles.qr} src={`data:image/svg+xml;utf8,${encodeURIComponent(c.svg)}`} alt={`QR code for ${pageUrl}?c=${c.code}`} />
        </article>
      ))}
    </div>
  )
}
