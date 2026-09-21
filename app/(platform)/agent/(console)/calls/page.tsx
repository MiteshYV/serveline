import { requirePlatform } from '@/auth/session.ts'
import { CALL_OUTCOMES, CALL_TRANSPORTS, listCalls } from '@/db/repos/index.ts'
import { Button } from '@/ui/Button.tsx'
import { Field } from '@/ui/Field.tsx'
import { PageHead, Tag } from '../../bits.tsx'
import c from '../../console.module.css'
import { capitalise, fmtIst, inr, shortId } from '../../format.ts'

export const metadata = { title: 'Calls — ServeLine agent console' }

type Search = Promise<Record<string, string | string[] | undefined>>
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? ''

type Outcome = (typeof CALL_OUTCOMES)[number]
type Transport = (typeof CALL_TRANSPORTS)[number]
const isOutcome = (s: string): s is Outcome => (CALL_OUTCOMES as readonly string[]).includes(s)
const isTransport = (s: string): s is Transport => (CALL_TRANSPORTS as readonly string[]).includes(s)

/** Build Spec §4's enum values as a person reads them: `deflected_sms` → "Deflected sms". */
const label = (s: string) => capitalise(s.replaceAll('_', ' '))

const PAGE = 100

/**
 * Build Spec §8 "Call review: calls filtered by outcome"; M2 design "Surfaces": the list — outlet,
 * started, language, intent, outcome, cost — with the transport the design adds so demo calls
 * are separable from real ones (Build Spec §12). Newest first, keyed on `started_at`.
 */
export default async function CallsPage({ searchParams }: { searchParams: Search }) {
  await requirePlatform()
  const sp = await searchParams
  const outcomeRaw = one(sp.outcome)
  const transportRaw = one(sp.transport)
  const outcome = isOutcome(outcomeRaw) ? outcomeRaw : undefined
  const transport = isTransport(transportRaw) ? transportRaw : undefined
  const beforeRaw = new Date(one(sp.before))
  const before = Number.isNaN(beforeRaw.getTime()) ? undefined : beforeRaw
  const filtered = outcome !== undefined || transport !== undefined

  const rows = await listCalls({ outcome, transport, before, limit: PAGE })
  const last = rows[rows.length - 1]
  const olderHref = last && rows.length === PAGE
    ? `/agent/calls?${new URLSearchParams({ ...(outcome ? { outcome } : {}), ...(transport ? { transport } : {}), before: last.startedAt.toISOString() })}`
    : null

  return (
    <>
      <PageHead
        title="Calls"
        meta={
          <>
            Newest first, <span className="num">{PAGE}</span> a page. Browser calls are the simulator and the mic page — demos, never
            counted toward the allowance; only telephone calls are.
          </>
        }
        actions={<Button href="/agent/calls/simulate" size="dense">Simulate a call</Button>}
      />

      <form method="get" action="/agent/calls" className={c.inlineForm}>
        <Field id="outcome" label="Outcome" className="w-[180px]">
          {(p) => (
            <select {...p} name="outcome" defaultValue={outcome ?? ''} className={c.select}>
              <option value="">Any</option>
              {CALL_OUTCOMES.map((o) => <option key={o} value={o}>{label(o)}</option>)}
            </select>
          )}
        </Field>
        <Field id="transport" label="Transport" className="w-[140px]">
          {(p) => (
            <select {...p} name="transport" defaultValue={transport ?? ''} className={c.select}>
              <option value="">Any</option>
              {CALL_TRANSPORTS.map((t) => <option key={t} value={t}>{capitalise(t)}</option>)}
            </select>
          )}
        </Field>
        <Button type="submit" size="dense" variant="ghost">Apply</Button>
        {filtered && <Button href="/agent/calls" size="dense" variant="ghost">Clear</Button>}
      </form>

      <div className={c.tableWrap}>
        <table className={c.table}>
          <thead>
            <tr>
              <th>Outlet</th>
              <th>Started</th>
              <th>Transport</th>
              <th>Language</th>
              <th>Intent</th>
              <th>Outcome</th>
              <th className={c.right}>Turns</th>
              <th className={c.right}>Cost</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.restaurantName} <span className={c.muted}>· {r.outletName}</span></td>
                <td className={`${c.nowrap} num`}>
                  <a href={`/agent/calls/${r.id}`} style={{ display: 'inline-block', minHeight: 'var(--touch-dense)', lineHeight: 'var(--touch-dense)' }}>{fmtIst(r.startedAt)}</a> <span className={c.muted}>{shortId(r.id)}</span>
                </td>
                <td><Tag tone={r.transport === 'exotel' ? 'strong' : 'default'}>{capitalise(r.transport)}</Tag></td>
                <td>{r.languageDetected ?? '—'}</td>
                <td>{label(r.intent)}</td>
                <td>
                  {r.outcome ? label(r.outcome) : <span className={c.muted}>Live</span>}
                  {r.handoffReason && <span className={`${c.muted} num`}> · {r.handoffReason}</span>}
                </td>
                <td className={`${c.right} num`}>{r.callerTurns}</td>
                <td className={`${c.right} num`}>{inr(r.totalPaise)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className={c.muted}>
                  {filtered || before ? 'No calls match.' : 'No calls yet. Run one in the simulator.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {olderHref && (
        <div className={c.actions}>
          <Button href={olderHref} size="dense" variant="ghost">Older</Button>
        </div>
      )}
    </>
  )
}
