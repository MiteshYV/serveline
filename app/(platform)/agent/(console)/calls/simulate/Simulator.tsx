'use client'

import { useState, type FormEvent } from 'react'
import type { ToolCallRecord } from '@/db/repos/calls.ts'
import { Band } from '@/ui/Band.tsx'
import { Button } from '@/ui/Button.tsx'
import { Field } from '@/ui/Field.tsx'
import type { Lang } from '@/ui/i18n.ts'
import { Panel, Tag } from '../../../bits.tsx'
import c from '../../../console.module.css'
import { endSimulatedCall, sendSimulatedTurn, startSimulatedCall } from './actions.ts'

type Outlet = { id: string; restaurant: string; name: string }
type Caller = { id: string; firstName: string | null; phoneTail: string; preferredLanguage: Lang | null }
type Line = { who: 'ai' | 'customer'; text: string; lang: Lang; toolCalls?: ToolCallRecord[] }
type Live = { callId: string; lang: Lang; lines: Line[]; ended: boolean; outcome?: string; orderId?: string }

const LANGS: Lang[] = ['hi', 'en', 'kn']
const LANG_LABEL: Record<Lang, string> = { hi: 'Hindi', en: 'English', kn: 'Kannada' }

/** One tool call on one muted line: `search_menu {"query":"dosa"} → ok · 12 ms`. */
function toolLine(tc: ToolCallRecord): string {
  const r = tc.result
  const outcome = typeof r === 'object' && r !== null && 'ok' in r
    ? (r.ok ? 'ok' : `refused: ${'reason' in r && typeof r.reason === 'string' ? r.reason : 'unknown'}`)
    : 'result'
  return `${tc.name} ${JSON.stringify(tc.args)} → ${outcome} · ${tc.ms} ms`
}

/**
 * Setup, then the conversation. Nothing here knows the brain: the three server actions do,
 * and the shape of a reply is the loop's `TurnResult`. One turn in flight at a time — the loop
 * does not serialise turns for one call (app/api/v1/voice ponytail), so the input locks while
 * a reply is pending.
 */
export function Simulator({ outlets, callers }: { outlets: Outlet[]; callers: Caller[] }) {
  const [live, setLive] = useState<Live | null>(null)
  const [draft, setDraft] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onStart(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const customerId = String(fd.get('customerId') ?? '')
    setPending(true)
    setError(null)
    const res = await startSimulatedCall({ outletId: fd.get('outletId'), customerId: customerId || null, lang: fd.get('lang') })
    setPending(false)
    if (!res.ok) return setError(res.error)
    setLive({ callId: res.callId, lang: res.lang, lines: [{ who: 'ai', text: res.greeting, lang: res.lang }], ended: false })
  }

  async function onSend(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const text = draft.trim()
    if (!live || live.ended || !text) return
    const { callId, lang } = live
    setPending(true)
    setError(null)
    setDraft('')
    setLive((l) => l && { ...l, lines: [...l.lines, { who: 'customer', text, lang }] })
    const res = await sendSimulatedTurn({ callId, text, lang })
    setPending(false)
    if (!res.ok) {
      setError(res.error)
      if (res.ended) setLive((l) => l && { ...l, ended: true, outcome: l.outcome ?? 'failed' })
      return
    }
    setLive((l) => l && {
      ...l,
      lines: [...l.lines, { who: 'ai', text: res.reply, lang: res.lang ?? l.lang, toolCalls: res.toolCalls }],
      ended: res.ended,
      ...(res.outcome ? { outcome: res.outcome } : {}),
      ...(res.orderId ? { orderId: res.orderId } : {}),
    })
  }

  async function onEnd() {
    if (!live || live.ended) return
    setPending(true)
    setError(null)
    const res = await endSimulatedCall({ callId: live.callId })
    setPending(false)
    if (!res.ok) return setError(res.error)
    setLive((l) => l && { ...l, ended: true })
  }

  if (!live) {
    return (
      <Panel title="Start a call">
        <form onSubmit={onStart} className={c.inlineForm}>
          <Field id="outletId" label="Outlet" className="w-[280px]">
            {(p) => (
              <select {...p} name="outletId" className={c.select} required>
                {outlets.map((o) => <option key={o.id} value={o.id}>{o.restaurant} · {o.name}</option>)}
              </select>
            )}
          </Field>
          <Field
            id="customerId"
            label="Caller"
            className="w-[280px]"
            hint="A new caller has no phone number, so the assistant can take the order but cannot place it. Pick a customer to place one."
          >
            {(p) => (
              <select {...p} name="customerId" className={c.select}>
                <option value="">New caller</option>
                {callers.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.firstName ?? 'No name'} · •••• {k.phoneTail}{k.preferredLanguage ? ` · ${k.preferredLanguage}` : ''}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field id="lang" label="Language" className="w-[140px]">
            {(p) => (
              <select {...p} name="lang" className={c.select} defaultValue="en">
                {LANGS.map((l) => <option key={l} value={l}>{LANG_LABEL[l]}</option>)}
              </select>
            )}
          </Field>
          <Button type="submit" size="dense" disabled={pending || outlets.length === 0}>{pending ? 'Starting…' : 'Start'}</Button>
        </form>
        {outlets.length === 0 && <p className={`${c.muted} m-0`}>No outlet to call. Add a restaurant first.</p>}
        {error && <Band tone="attention">{error}</Band>}
      </Panel>
    )
  }

  return (
    <div className="grid gap-[var(--space-16)]">
      {live.ended && (
        <Band tone="neutral" action={<a href={`/agent/calls/${live.callId}`}>Review this call</a>}>
          Call ended{live.outcome && <> — <span className="num">{live.outcome}</span></>}
          {live.orderId && <> · order <span className="num">{live.orderId.slice(0, 8)}</span></>}
        </Band>
      )}
      {error && <Band tone="attention">{error}</Band>}

      <Panel
        title="Conversation"
        actions={
          <>
            <span className={`${c.muted} num`}>call {live.callId.slice(0, 8)}</span>
            {live.ended ? (
              <Button type="button" size="dense" variant="ghost" onClick={() => { setLive(null); setError(null) }}>New call</Button>
            ) : (
              <Button type="button" size="dense" variant="ghost" onClick={onEnd} disabled={pending}>End call</Button>
            )}
          </>
        }
      >
        <ol role="list" className="m-0 p-0 list-none grid">
          {live.lines.map((line, i) => (
            <li key={i} className="grid grid-cols-[max-content_1fr] gap-[var(--space-12)] py-[var(--space-8)] border-b border-[color:var(--border-separator)] last:border-b-0">
              <Tag tone={line.who === 'ai' ? 'strong' : 'default'}>{line.who === 'ai' ? 'AI' : 'Caller'}</Tag>
              <div>
                <p className="m-0" style={{ whiteSpace: 'pre-wrap' }}>{line.text}</p>
                {line.toolCalls && line.toolCalls.length > 0 && (
                  <p className={`${c.muted} num`} style={{ margin: 'var(--space-4) 0 0', fontSize: 'var(--text-caption)', wordBreak: 'break-word' }}>
                    {line.toolCalls.map(toolLine).join(' · ')}
                  </p>
                )}
              </div>
            </li>
          ))}
          {pending && !live.ended && (
            <li className="grid grid-cols-[max-content_1fr] gap-[var(--space-12)] py-[var(--space-8)]">
              <Tag tone="strong">AI</Tag>
              <p className={`${c.muted} m-0`}>…</p>
            </li>
          )}
        </ol>

        {!live.ended && (
          <form onSubmit={onSend} className={c.inlineForm}>
            <Field id="say" label="Caller says" className="grow min-w-[280px]">
              {(p) => (
                <input
                  {...p}
                  name="say"
                  className={c.input}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  maxLength={500}
                  autoComplete="off"
                  autoFocus
                  disabled={pending}
                />
              )}
            </Field>
            <Field id="turnLang" label="Language" className="w-[140px]">
              {(p) => (
                <select {...p} name="turnLang" className={c.select} value={live.lang} onChange={(e) => setLive((l) => l && { ...l, lang: e.target.value as Lang })} disabled={pending}>
                  {LANGS.map((l) => <option key={l} value={l}>{LANG_LABEL[l]}</option>)}
                </select>
              )}
            </Field>
            <Button type="submit" size="dense" disabled={pending || draft.trim() === ''}>{pending ? 'Sending…' : 'Send'}</Button>
          </form>
        )}
      </Panel>
    </div>
  )
}
