import { notFound } from 'next/navigation'
import { Fragment } from 'react'
import { z } from 'zod'
import { requirePlatform } from '@/auth/session.ts'
import { CALL_TAGS, getCall, getOrder, getOutlet } from '@/db/repos/index.ts'
import { Button } from '@/ui/Button.tsx'
import { Field } from '@/ui/Field.tsx'
import { StatusChip } from '@/ui/StatusChip.tsx'
import { t } from '@/ui/i18n.ts'
import { LOW_CONF } from '@/voice/guardrails.ts'
import { ErrorBand, PageHead, Panel, Tag } from '../../../bits.tsx'
import c from '../../../console.module.css'
import { capitalise, fmtIst, inr, shortId } from '../../../format.ts'
import { saveTag } from './actions.ts'

export const metadata = { title: 'Call review — ServeLine agent console' }

type Params = Promise<{ id: string }>
type Search = Promise<Record<string, string | string[] | undefined>>

/** `call_turn.tool_calls` is jsonb; read back through the shape loop.ts writes (repos/calls.ts `ToolCallRecord`). */
const toolCalls = z.array(z.object({ name: z.string(), args: z.unknown(), result: z.unknown(), ms: z.number() }))
/** The envelope every handler answers with (src/voice/tools.ts `ToolResult`); anything else is shown raw. */
const envelope = z.object({ ok: z.boolean(), reason: z.string().optional() })

const TAG_LABEL: Record<(typeof CALL_TAGS)[number], string> = {
  misheard_item: 'Misheard item', address: 'Address', intent: 'Intent', vendor: 'Vendor', complaint: 'Complaint', other: 'Other',
}
const PAYMENT_METHOD = { upi_link: 'UPI link', cod: 'COD', pay_at_table: 'Pay at table' } as const
const label = (s: string) => capitalise(s.replaceAll('_', ' '))
const clock = (ms: number) => `${Math.floor(ms / 60_000)}:${String(Math.floor((ms % 60_000) / 1000)).padStart(2, '0')}`
const json = (v: unknown) => JSON.stringify(v, null, 2) ?? 'undefined'

/**
 * Build Spec §8 "Call review: read the transcript with per-turn confidence, tag the failure";
 * M2 design "Surfaces": transcript, every tool call with its arguments and result (Build Spec
 * §5.5), the cost breakdown, the tag for M4's tuning loop. The recording and "add a vocabulary
 * alias in place" wait for audio and M4.
 *
 * No phone number and no address line is on this page: the call row carries a hash and a
 * customer id, and the transcript is what was said — which the agent reviewing it needs to see.
 */
export default async function CallReviewPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  await requirePlatform()
  const { id } = await params
  const sp = await searchParams
  if (!z.uuid().safeParse(id).success) notFound()
  const call = await getCall(id)
  if (!call) notFound()
  const [outlet, order] = await Promise.all([getOutlet(call.outletId), call.orderId ? getOrder(call.orderId) : null])
  const error = Array.isArray(sp.error) ? sp.error[0] : sp.error
  const where = outlet ? `${outlet.restaurant.name} · ${outlet.name}` : shortId(call.outletId)

  return (
    <>
      {error && <ErrorBand message={error} dismissHref={`/agent/calls/${call.id}`} />}
      <PageHead
        crumbs={<><a href="/agent/calls">Calls</a> / {shortId(call.id)}</>}
        title={where}
        meta={
          <>
            <span className="num">{fmtIst(call.startedAt)}</span> · {capitalise(call.transport)} · {call.languageDetected ?? 'language not set'} ·{' '}
            {call.outcome ? label(call.outcome) : 'live'}{call.handoffReason && <> (<span className="num">{call.handoffReason}</span>)</>}
          </>
        }
      />

      <div className="grid gap-[var(--space-24)] lg:grid-cols-[3fr_2fr]">
        <Panel title="Transcript" actions={<span className={c.muted}><span className="num">{call.turns.length}</span> turns · confidence from the recogniser, low below <span className="num">{LOW_CONF}</span></span>}>
          <div className={c.tableWrap}>
            <table className={c.table}>
              <thead>
                <tr><th className={c.right}>#</th><th>Who</th><th>Said</th><th>Lang</th><th className={c.right}>Conf.</th><th className={c.right}>At</th></tr>
              </thead>
              <tbody>
                {call.turns.map((turn) => {
                  const calls = turn.speaker === 'ai' ? toolCalls.safeParse(turn.toolCalls) : null
                  const made = calls?.success ? calls.data : []
                  return (
                    <Fragment key={turn.id}>
                      <tr>
                        <td className={`${c.right} num`}>{turn.seq}</td>
                        <td><Tag tone={turn.speaker === 'ai' ? 'strong' : 'default'}>{turn.speaker === 'ai' ? 'AI' : 'Caller'}</Tag></td>
                        <td style={{ whiteSpace: 'pre-wrap' }}>{turn.text}</td>
                        <td>{turn.language ?? '—'}</td>
                        <td className={`${c.right} num`}>
                          {turn.asrConfidence === null ? '—' : turn.asrConfidence.toFixed(2)}
                          {turn.asrConfidence !== null && turn.asrConfidence < LOW_CONF && <> <Tag tone="strong">low</Tag></>}
                        </td>
                        <td className={`${c.right} ${c.nowrap} num`}>
                          {turn.startedMs === null ? '—' : clock(turn.startedMs)}
                          {turn.speaker === 'ai' && turn.startedMs !== null && turn.endedMs !== null && (
                            <span className={c.muted}> · {((turn.endedMs - turn.startedMs) / 1000).toFixed(1)} s</span>
                          )}
                        </td>
                      </tr>
                      {made.length > 0 && (
                        <tr>
                          <td />
                          <td colSpan={5}>
                            <div className="grid gap-[var(--space-8)]">
                              {made.map((tc, i) => {
                                const r = envelope.safeParse(tc.result)
                                return (
                                  <details key={i} className={c.details} open>
                                    <summary>
                                      <span className="num">{tc.name}</span>
                                      <span className={c.muted}>&nbsp;· {r.success ? (r.data.ok ? 'ok' : `refused: ${r.data.reason ?? 'unknown'}`) : 'result'} · <span className="num">{tc.ms}</span> ms</span>
                                    </summary>
                                    <div className="grid gap-[var(--space-4)] md:grid-cols-2">
                                      <div>
                                        <p className={`${c.muted} m-0`}>args</p>
                                        <pre className={c.pre}>{json(tc.args)}</pre>
                                      </div>
                                      <div>
                                        <p className={`${c.muted} m-0`}>result</p>
                                        <pre className={c.pre}>{json(tc.result)}</pre>
                                      </div>
                                    </div>
                                  </details>
                                )
                              })}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
                {call.turns.length === 0 && <tr><td colSpan={6} className={c.muted}>No turns recorded.</td></tr>}
              </tbody>
            </table>
          </div>
        </Panel>

        <div className="grid gap-[var(--space-24)] content-start">
          <Panel title="Call">
            <dl className={c.kv}>
              <dt>Outlet</dt><dd>{where}</dd>
              <dt>Transport</dt><dd>{capitalise(call.transport)}{call.providerCallSid && <span className={`${c.muted} num`}> · {call.providerCallSid}</span>}</dd>
              <dt>Caller</dt><dd>{call.customerId ? <>customer <span className="num">{shortId(call.customerId)}</span></> : call.fromPhoneHash ? <>known number, no profile</> : <span className={c.muted}>anonymous</span>}</dd>
              <dt>Started</dt><dd className="num">{fmtIst(call.startedAt)}</dd>
              <dt>Ended</dt><dd className="num">{fmtIst(call.endedAt)}</dd>
              <dt>Duration</dt><dd className="num">{call.durationSec === null ? '—' : `${call.durationSec} s`}</dd>
              <dt>Language</dt><dd>{call.languageDetected ?? '—'}</dd>
              <dt>Intent</dt><dd>{label(call.intent)}</dd>
              <dt>Outcome</dt><dd>{call.outcome ? label(call.outcome) : <span className={c.muted}>live</span>}</dd>
              <dt>Handoff reason</dt><dd className="num">{call.handoffReason ?? '—'}</dd>
              <dt>Answered by</dt><dd>{label(call.answeredBy)}</dd>
              <dt>Counts toward allowance</dt>
              <dd>{call.countsTowardAllowance ? 'Yes' : 'No'}{call.countsTowardAllowance && call.transport === 'browser' && <span className={c.muted}> · flagged, but browser calls are not billed</span>}</dd>
            </dl>
          </Panel>

          <Panel title="Tag" actions={<span className={c.muted}>For M4's tuning loop (Build Spec §8)</span>}>
            <form action={saveTag} className={c.inlineForm}>
              <input type="hidden" name="id" value={call.id} />
              <Field id="tag" label="Failure" className="w-[200px]">
                {(p) => (
                  <select {...p} name="tag" defaultValue={call.tag ?? ''} className={c.select}>
                    <option value="">Not tagged</option>
                    {CALL_TAGS.map((tag) => <option key={tag} value={tag}>{TAG_LABEL[tag]}</option>)}
                  </select>
                )}
              </Field>
              <Button type="submit" size="dense">Save</Button>
            </form>
          </Panel>

          <Panel title="Cost">
            {call.cost ? (
              <dl className={c.kv}>
                <dt>LLM</dt><dd className="num">{inr(call.cost.llmPaise)} <span className={c.muted}>· {call.cost.tokensIn} in / {call.cost.tokensOut} out</span></dd>
                <dt>SMS</dt><dd className="num">{inr(call.cost.smsPaise)}</dd>
                <dt>Telephony</dt><dd className="num">{inr(call.cost.telephonyPaise)}</dd>
                <dt>STT</dt><dd className="num">{inr(call.cost.sttPaise)} <span className={c.muted}>· {call.cost.sttSeconds} s</span></dd>
                <dt>TTS</dt><dd className="num">{inr(call.cost.ttsPaise)} <span className={c.muted}>· {call.cost.ttsChars} chars</span></dd>
                <dt><strong>Total</strong></dt><dd className="num"><strong>{inr(call.cost.totalPaise)}</strong></dd>
              </dl>
            ) : (
              <p className={`${c.muted} m-0`}>No cost row yet — the ledger accrues from the first caller turn.</p>
            )}
          </Panel>

          <Panel title="Order">
            {order ? (
              <dl className={c.kv}>
                <dt>Order</dt><dd className="num">{shortId(order.id)}</dd>
                <dt>Status</dt><dd><StatusChip status={order.status} fulfilment={order.fulfilment} variant="outline" lang="en" /></dd>
                <dt>Channel</dt><dd>{t(`channel.${order.channel}`, 'en')}</dd>
                <dt>Fulfilment</dt><dd>{capitalise(order.fulfilment.replace('_', '-'))}</dd>
                <dt>Items</dt><dd>{order.items.map((i) => `${i.qty}× ${i.nameSnapshot}`).join(', ')}</dd>
                <dt>Total</dt><dd className="num">{inr(order.totalPaise)}</dd>
                <dt>Payment</dt><dd>{PAYMENT_METHOD[order.paymentMethod]} · {t(`payment.${order.paymentStatus}`, 'en')}</dd>
                <dt>Placed</dt><dd className="num">{fmtIst(order.placedAt)}</dd>
              </dl>
            ) : (
              <p className={`${c.muted} m-0`}>{call.orderId ? 'The linked order no longer exists.' : 'No order from this call.'}</p>
            )}
          </Panel>
        </div>
      </div>
    </>
  )
}
