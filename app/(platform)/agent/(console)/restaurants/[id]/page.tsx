import { notFound } from 'next/navigation'
import { requirePlatform } from '@/auth/session.ts'
import { STAGE_LABEL, deriveChecklist, onboardingStage } from '@/core/onboarding.ts'
import { getRestaurantDetail, listBatches, listRedemptionsForBatch, overviewFacts } from '@/db/repos/index.ts'
import { Button } from '@/ui/Button.tsx'
import { Field } from '@/ui/Field.tsx'
import { StatusChip } from '@/ui/StatusChip.tsx'
import { t } from '@/ui/i18n.ts'
import { ErrorBand, PageHead, Panel, Tag } from '../../../bits.tsx'
import c from '../../../console.module.css'
import { capitalise, fmtIst, inr, shortId } from '../../../format.ts'
import { setRestaurantStatus, setTrialCallLimit } from './actions.ts'

type Params = Promise<{ id: string }>
type Search = Promise<Record<string, string | string[] | undefined>>

const PAYMENT_METHOD = { upi_link: 'UPI link', cod: 'COD', pay_at_table: 'Pay at table' } as const

function StepMark({ state }: { state: 'done' | 'todo' | 'deferred' }) {
  if (state === 'deferred') return <span className={c.stepMark} aria-hidden="true" />
  return (
    <span className={c.stepMark} aria-hidden="true">
      <svg width="16" height="16" viewBox="0 0 16 16">
        <rect x="1.5" y="1.5" width="13" height="13" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
        {state === 'done' && <path d="M4 8.5l2.75 2.75L12 5.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />}
      </svg>
    </span>
  )
}

/** Build Spec §8, the M1 subset: overview, derived checklist (§11), batches, orders, admin actions. */
export default async function RestaurantPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const session = await requirePlatform()
  const { id } = await params
  const sp = await searchParams
  const r = await getRestaurantDetail(id)
  if (!r) notFound()

  const batches = await listBatches(id)
  const redemptions = await Promise.all(batches.map(async (b) => ({ batch: b, rows: await listRedemptionsForBatch(b.id) })))
  const steps = deriveChecklist(overviewFacts(r))
  const error = Array.isArray(sp.error) ? sp.error[0] : sp.error
  const menuHref = (outletId: string) => `/agent/restaurants/${id}/menu?outlet=${outletId}`
  const firstOutlet = r.outlets[0]

  return (
    <>
      {error && <ErrorBand message={error} dismissHref={`/agent/restaurants/${id}`} />}
      <PageHead
        crumbs={<><a href="/agent">Restaurants</a> / {r.name}</>}
        title={r.name}
        meta={
          <>
            <span className="num">/r/{r.slug}</span> · {capitalise(r.status)} · {STAGE_LABEL[onboardingStage(overviewFacts(r))]} ·
            trial from <span className="num">{fmtIst(r.trialStartedAt)}</span>, limit <span className="num">{r.trialCallLimit}</span> calls
          </>
        }
        actions={
          <>
            {firstOutlet && <Button href={menuHref(firstOutlet.id)} size="dense">Edit menu</Button>}
            <Button href={`/r/${r.slug}`} size="dense" variant="ghost">Ordering page</Button>
          </>
        }
      />

      <div className="grid gap-[var(--space-24)] lg:grid-cols-[3fr_2fr]">
        <Panel title="Onboarding checklist" actions={<span className={c.muted}>Build Spec §11 · steps 1, 3, 5, 7 derived from data; the rest arrive with their milestone</span>}>
          <ol className={c.checklist}>
            {steps.map((s) => (
              <li key={s.n} className={c.step} data-state={s.state}>
                <StepMark state={s.state} />
                <span>
                  <span className="num">{s.n}.</span> {s.title}
                  {s.note && <span className={c.stepNote}>{s.note}</span>}
                </span>
                <span className={c.stepMeta}>
                  {s.state === 'deferred' ? <Tag tone="quiet">M2–M5</Tag> : s.state === 'done' ? <>Done{s.at && <> · <span className="num">{fmtIst(s.at)}</span></>}</> : 'To do'}
                </span>
              </li>
            ))}
          </ol>
        </Panel>

        <div className="grid gap-[var(--space-24)] content-start">
          <Panel title="Customers">
            <dl className={c.kv}>
              <dt>Known customers</dt><dd className="num">{r.knownCustomers}</dd>
              <dt>Active consents</dt><dd className="num">{r.activeConsents}</dd>
              <dt>First order</dt><dd className="num">{fmtIst(r.firstOrderAt)}</dd>
              <dt>Last order</dt><dd className="num">{fmtIst(r.lastOrderAt)}</dd>
              <dt>Needs attention</dt><dd className="num">{r.needsAttentionCount}</dd>
            </dl>
          </Panel>

          <Panel title="Staff">
            <dl className={c.kv}>
              {r.staff.map((s) => (
                <span key={s.id} className="contents">
                  <dt>{capitalise(s.role)}</dt>
                  <dd>{s.name} <span className={c.muted}>· last login <span className="num">{fmtIst(s.lastLoginAt)}</span></span></dd>
                </span>
              ))}
              {r.staff.length === 0 && <><dt>—</dt><dd className={c.muted}>No staff users</dd></>}
            </dl>
          </Panel>

          {session.role === 'admin' && (
            <Panel title="Admin">
              <form action={setTrialCallLimit} className={c.inlineForm}>
                <input type="hidden" name="id" value={r.id} />
                <Field id="trialCallLimit" label="Trial call limit" className="w-[160px]">
                  {(p) => <input {...p} name="trialCallLimit" className={`${c.input} num`} inputMode="numeric" defaultValue={r.trialCallLimit} />}
                </Field>
                <Button type="submit" size="dense" variant="ghost">Save</Button>
              </form>
              {r.status === 'suspended' ? (
                <form action={setRestaurantStatus}>
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="status" value="active" />
                  <Button type="submit" size="dense">Reactivate restaurant</Button>
                </form>
              ) : (
                <details className={c.details}>
                  <summary>Suspend restaurant…</summary>
                  <form action={setRestaurantStatus} className="grid gap-[var(--space-12)]">
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="status" value="suspended" />
                    <p className="m-0">Sets the status to suspended. Reactivating sets it to active.</p>
                    <div><Button type="submit" size="dense" variant="danger">Suspend {r.name}</Button></div>
                  </form>
                </details>
              )}
            </Panel>
          )}
        </div>
      </div>

      <Panel title="Outlets">
        <div className={c.tableWrap}>
          <table className={c.table}>
            <thead>
              <tr><th>Outlet</th><th>Area</th><th>Pincode</th><th>Status</th><th>Display phone</th><th>Owner mobile</th><th>Languages</th><th>COD</th><th>Menu</th></tr>
            </thead>
            <tbody>
              {r.outlets.map((o) => {
                const m = r.menus.find((x) => x.outletId === o.id)
                return (
                  <tr key={o.id}>
                    <td>{o.name}</td>
                    <td>{o.area}</td>
                    <td className="num">{o.pincode}</td>
                    <td><Tag>{capitalise(o.status)}</Tag></td>
                    <td className="num">{o.displayPhone ?? '—'}</td>
                    <td className="num">{o.ownerMobile ?? '—'}</td>
                    <td>{o.languages.join(', ')}</td>
                    <td>{o.codEnabled ? 'On' : 'Off'}</td>
                    <td>
                      {m ? (
                        <><span className="num">v{m.version}</span> · <span className="num">{m.itemCount}</span> items · {m.publishedAt ? <>published <span className="num">{fmtIst(m.publishedAt)}</span></> : 'draft'} · </>
                      ) : 'no menu · '}
                      <a href={menuHref(o.id)}>{m ? 'edit' : 'create'}</a>
                    </td>
                  </tr>
                )
              })}
              {r.outlets.length === 0 && <tr><td colSpan={9} className={c.muted}>No outlet yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Card batches" actions={<span className={c.muted}>Redemption counts from listRedemptionsForBatch</span>}>
        <div className={c.tableWrap}>
          <table className={c.table}>
            <thead>
              <tr><th>Batch</th><th>Created</th><th className={c.right}>Cards</th><th className={c.right}>Codes</th><th className={c.right}>Redemptions</th><th>Printed</th><th>Placed</th><th>Placement audited</th></tr>
            </thead>
            <tbody>
              {redemptions.map(({ batch: b, rows }) => (
                <tr key={b.id}>
                  <td className="num">{shortId(b.id)}</td>
                  <td className={`${c.nowrap} num`}>{fmtIst(b.createdAt)}</td>
                  <td className={`${c.right} num`}>{b.qty}</td>
                  <td className={`${c.right} num`}>{b.codeCount}</td>
                  <td className={`${c.right} num`}>{rows.length}</td>
                  <td className={`${c.nowrap} num`}>{fmtIst(b.printedAt)}</td>
                  <td className={`${c.nowrap} num`}>{fmtIst(b.placedAt)}</td>
                  <td className={`${c.nowrap} num`}>{fmtIst(b.placementAuditedAt)}</td>
                </tr>
              ))}
              {batches.length === 0 && <tr><td colSpan={8} className={c.muted}>No card batches yet. The dashboard generates them (Build Spec §7).</td></tr>}
            </tbody>
          </table>
        </div>
        {redemptions.some((x) => x.rows.length > 0) && (
          <div className={c.tableWrap}>
            <table className={c.table}>
              <thead><tr><th>Code</th><th>Batch</th><th>Redeemed</th><th>Channel</th><th>Order</th></tr></thead>
              <tbody>
                {redemptions.flatMap(({ batch, rows }) => rows.map((x) => (
                  <tr key={x.id}>
                    <td className="num">{x.code}</td>
                    <td className="num">{shortId(batch.id)}</td>
                    <td className={`${c.nowrap} num`}>{fmtIst(x.redeemedAt)}</td>
                    <td>{t(`channel.${x.channel}`, 'en')}</td>
                    <td className="num">{shortId(x.orderId)}</td>
                  </tr>
                )))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="Recent orders" actions={<span className={c.muted}>Last 20</span>}>
        <div className={c.tableWrap}>
          <table className={c.table}>
            <thead>
              <tr><th>Placed</th><th>Order</th><th>Status</th><th>Channel</th><th>Fulfilment</th><th>Items</th><th className={c.right}>Total</th><th>Payment</th></tr>
            </thead>
            <tbody>
              {r.recentOrders.map((o) => (
                <tr key={o.id}>
                  <td className={`${c.nowrap} num`}>{fmtIst(o.placedAt)}</td>
                  <td className="num">{shortId(o.id)}{o.tableNo && <span className={c.muted}> · T{o.tableNo}</span>}</td>
                  <td><StatusChip status={o.status} fulfilment={o.fulfilment} variant="outline" lang="en" /></td>
                  <td>{t(`channel.${o.channel}`, 'en')}</td>
                  <td>{capitalise(o.fulfilment.replace('_', '-'))}</td>
                  <td>{o.items.map((i) => `${i.qty}× ${i.nameSnapshot}`).join(', ')}</td>
                  <td className={`${c.right} num`}>{inr(o.totalPaise)}</td>
                  <td>{PAYMENT_METHOD[o.paymentMethod]} · {t(`payment.${o.paymentStatus}`, 'en')}</td>
                </tr>
              ))}
              {r.recentOrders.length === 0 && <tr><td colSpan={8} className={c.muted}>No orders yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Weekly aggregator counts" actions={<span className={c.muted}>The Direct Order Share denominator (Ideation §9)</span>}>
        <div className={c.tableWrap}>
          <table className={c.table}>
            <thead><tr><th>Outlet</th><th>Week of (Mon)</th><th className={c.right}>Swiggy</th><th className={c.right}>Zomato</th><th className={c.right}>Other</th><th>Entered</th></tr></thead>
            <tbody>
              {r.externalCounts.map((x) => (
                <tr key={x.id}>
                  <td>{x.outletName}</td>
                  <td className="num">{x.weekStart}</td>
                  <td className={`${c.right} num`}>{x.swiggyOrders}</td>
                  <td className={`${c.right} num`}>{x.zomatoOrders}</td>
                  <td className={`${c.right} num`}>{x.otherOrders}</td>
                  <td className={`${c.nowrap} num`}>{fmtIst(x.enteredAt)}</td>
                </tr>
              ))}
              {r.externalCounts.length === 0 && <tr><td colSpan={6} className={c.muted}>None entered yet. The dashboard asks every Monday (Build Spec §7).</td></tr>}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  )
}
