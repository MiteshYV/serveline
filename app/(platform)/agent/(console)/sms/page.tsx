import { vendorMode } from '@/adapters/mode.ts'
import { mockInbox } from '@/adapters/sms/mock.ts'
import { requirePlatform } from '@/auth/session.ts'
import { Band } from '@/ui/Band.tsx'
import { Button } from '@/ui/Button.tsx'
import { PageHead, Panel, Tag } from '../../bits.tsx'
import c from '../../console.module.css'
import { fmtIst, inr, maskPhone } from '../../format.ts'
import { clearInbox } from './actions.ts'

export const metadata = { title: 'Mock SMS inbox — ServeLine agent console' }

/**
 * M1 design, "Adapters": the SMS mock writes to an in-app inbox, which is "how OTP works in demo
 * mode" and a better demo artefact than a real message. This page is that inbox: the demo's
 * phone, and the agent's debugging tool. It only exists under VENDOR_MODE=mock.
 */
export default async function SmsInboxPage() {
  await requirePlatform()
  if (vendorMode() !== 'mock') {
    return (
      <>
        <PageHead title="Mock SMS inbox" />
        <Panel title="Not available in live mode">
          <p className="m-0">
            The mock inbox exists only under <code>VENDOR_MODE=mock</code>. Live messages go through the provider
            named in <code>SMS_PROVIDER</code> and are logged, by phone hash, in <code>sms_message</code>.
          </p>
        </Panel>
      </>
    )
  }

  const messages = mockInbox.list()
  return (
    <>
      <PageHead
        title="Mock SMS inbox"
        meta={<><span className="num">{messages.length}</span> messages in this server process, newest first. Restarting the app empties it.</>}
        actions={
          <form action={clearInbox}>
            <Button type="submit" size="dense" variant="ghost" disabled={messages.length === 0}>Clear inbox</Button>
          </form>
        }
      />
      <Band tone="neutral">
        Mock inbox — this is the demo&apos;s phone. Every SMS the app &ldquo;sent&rdquo; lands here and nowhere else; nothing reaches a handset.
      </Band>

      <div className={c.tableWrap}>
        <table className={c.table}>
          <thead>
            <tr><th>Sent</th><th>To</th><th>Kind</th><th>Lang</th><th className={c.right}>Segments</th><th className={c.right}>Cost</th><th>Text</th></tr>
          </thead>
          <tbody>
            {messages.map((m) => (
              <tr key={m.id}>
                <td className={`${c.nowrap} num`}>{fmtIst(m.at)}</td>
                <td className={`${c.nowrap} num`}>{maskPhone(m.toPhone)}</td>
                <td><Tag>{m.kind}</Tag></td>
                <td>{m.language}</td>
                <td className={`${c.right} num`}>{m.segments}</td>
                <td className={`${c.right} num`}>{inr(m.costPaise)}</td>
                <td><pre className={c.pre} style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--text-body)' }}>{m.text}</pre></td>
              </tr>
            ))}
            {messages.length === 0 && (
              <tr><td colSpan={7} className={c.muted}>Nothing sent yet. Sign in on the ordering page or the dashboard and the OTP appears here.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}
