import * as QRCode from 'qrcode'
import { nagDecision, weekToAsk } from '@/core/aggregator-nag.ts'
import { istDayStart } from '@/core/calendar.ts'
import {
  countOrdersSince, getExternalCount, hasAnyOrders, listBoardOrders, listDoneOrdersSince, orderNumbers, rushCount,
} from '@/db/repos/index.ts'
import { Button } from '@/ui/Button.tsx'
import { EmptyState } from '@/ui/EmptyState.tsx'
import { td } from '@/ui/i18n-dashboard.ts'
import { t } from '@/ui/i18n.ts'
import { toCardWire } from '@/ui/orderWire.ts'
import { appOrigin } from '../_lib/origin.ts'
import { readLang, readNagCookie } from '../_lib/prefs.ts'
import { currentOutlet } from '../_lib/session.ts'
import { PageHead } from './bits.tsx'
import { Board } from './Board.tsx'
import { MondayNag } from './MondayNag.tsx'
import styles from './Board.module.css'

export const metadata = { title: 'Board — ServeLine' }

/** The live board (Build Spec §7): server-rendered once, then the Board component keeps it live. */
export default async function BoardPage() {
  const { outlet, restaurant } = await currentOutlet()
  const lang = await readLang()
  const now = new Date()
  const dayStart = istDayStart(now)
  const week = weekToAsk(now)

  const [open, done, ordersToday, any, rush, entered, nagCookie] = await Promise.all([
    listBoardOrders(outlet.id),
    listDoneOrdersSince(outlet.id, dayStart),
    countOrdersSince(outlet.id, dayStart),
    hasAnyOrders(outlet.id),
    rushCount(outlet.id),
    getExternalCount(outlet.id, week),
    readNagCookie(),
  ])
  const numbers = await orderNumbers(outlet.id, [...open, ...done])
  const cards = [...open, ...done].map((o) => toCardWire(o, numbers.get(o.id)))

  const nag = nagDecision({ now, entered: entered !== null, rush, cookie: nagCookie })

  if (!any) {
    // Design §7.9 first-run: teach the interface, offer the page, and the QR to print.
    const origin = await appOrigin()
    const pageUrl = `${origin}/r/${restaurant.slug}`
    const svg = await QRCode.toString(`${pageUrl}?t=1`, { type: 'svg', margin: 1, width: 160 })
    return (
      <div className={styles.board}>
        {/* Design §7.8: the nag sits below the header and above the board, in normal flow. */}
        <PageHead title={td('nav.board', lang)} />
        {nag === 'show' && <MondayNag lang={lang} weekStart={week} />}
        <EmptyState
          kind="first-run"
          lang={lang}
          action={
            <>
              <Button size="counter" href={pageUrl}>{t('empty.previewPage', lang)}</Button>
              <Button size="counter" variant="ghost" href="/app/orders/new">{td('nav.newOrder', lang)}</Button>
            </>
          }
        />
        <figure className={styles.qr}>
          <img src={`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`} alt={`${td('board.tableQr', lang)}: ${pageUrl}?t=1`} />
          <figcaption className={styles.qrLabel}>{td('board.tableQr', lang)} · {t('checkout.table', lang, { n: 1 })}</figcaption>
        </figure>
      </div>
    )
  }

  return (
    <div className={styles.board}>
      <PageHead title={td('nav.board', lang)} />
      {nag === 'show' && <MondayNag lang={lang} weekStart={week} />}
      <Board outletId={outlet.id} lang={lang} initial={cards} since={now.toISOString()} ordersToday={ordersToday} />
    </div>
  )
}
