import { authorisedOutlet, changesSince, parseSince } from './feed.ts'

export const dynamic = 'force-dynamic'

/** The 5-second polling fallback behind the event stream (Build Spec §7): `?since=<ISO>`. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const outlet = await authorisedOutlet(id)
  if (!outlet) return new Response('Not found', { status: 404 })
  return Response.json(await changesSince(outlet.id, parseSince(req.url)), {
    headers: { 'Cache-Control': 'no-store' },
  })
}
