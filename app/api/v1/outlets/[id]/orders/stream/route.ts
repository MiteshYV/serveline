import { authorisedOutlet, changesSince, parseSince } from '../feed.ts'

export const dynamic = 'force-dynamic'

const POLL_MS = 2_000
const HEARTBEAT_MS = 15_000
/** Overlap between polls, so an event committed just after a poll's read is not skipped. Merges are idempotent. */
const OVERLAP_MS = 1_000

/**
 * Build Spec §7: the board is refreshed by Server-Sent Events. One `data:` frame per tick that
 * found changes, a comment heartbeat otherwise so proxies keep the connection open.
 *
 * ponytail: DB polling inside the SSE handler, every 2 s per open dashboard. LISTEN/NOTIFY
 * (an `order_event` trigger) when per-outlet load makes polling visible — PGlite has no
 * listener, so not before the staging Postgres exists anyway.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const outlet = await authorisedOutlet(id)
  if (!outlet) return new Response('Not found', { status: 404 })

  let since = parseSince(req.url)
  const encoder = new TextEncoder()

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false
      const send = (text: string) => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(text))
        } catch {
          closed = true
        }
      }

      const tick = async () => {
        if (closed) return
        try {
          const feed = await changesSince(outlet.id, since)
          since = new Date(new Date(feed.at).getTime() - OVERLAP_MS)
          if (feed.orders.length > 0) send(`data: ${JSON.stringify(feed)}\n\n`)
        } catch {
          // A failed read is not the end of the stream; the next tick tries again and the
          // client's heartbeat timeout is what decides it is offline.
        }
      }

      const poll = setInterval(() => void tick(), POLL_MS)
      const beat = setInterval(() => send(': keep-alive\n\n'), HEARTBEAT_MS)
      const close = () => {
        closed = true
        clearInterval(poll)
        clearInterval(beat)
        try {
          controller.close()
        } catch {
          /* already closed */
        }
      }
      req.signal.addEventListener('abort', close)
      send(': connected\n\n')
      void tick()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
