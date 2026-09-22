/**
 * The voice evaluation harness (Build Spec §16). Runs every utterance in
 * contracts/voice-eval/ as its own call against the seeded menu, and scores what the assistant did
 * with it: the right items in the cart, the right intent, and how long the turn took.
 *
 * Not a unit test — it costs real model calls and its result is a number that moves, not a pass or
 * a fail. `npm run eval`; contracts/voice-eval/README.md has the flags and the caveats.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { z } from 'zod'
import { getRestaurantBySlug } from '../db/repos/index.ts'
import type { Lang } from '../ui/i18n.ts'
import { endCall, startCall, takeTurn } from './loop.ts'

const ExpectedItem = z.object({
  name: z.string(),
  qty: z.number().int().min(1).default(1),
  variant: z.string().optional(),
  options: z.array(z.string()).default([]),
})

const Case = z.object({
  id: z.string(),
  say: z.string().min(1),
  why: z.string().optional(),
  intent: z.enum(['order', 'enquiry', 'other']),
  expect: z.object({
    items: z.array(ExpectedItem).optional(),
    tool: z.string().optional(),
  }),
})

const Suite = z.object({ version: z.number(), language: z.enum(['hi', 'en', 'kn']), cases: z.array(Case) })
type EvalCase = z.infer<typeof Case>

/** The cart as a tool result reports it, which is what `add_to_cart` and `get_cart` both return. */
const CartLine = z.object({
  name: z.string(),
  qty: z.number().int(),
  variant: z.string().nullable().optional(),
  options: z.array(z.string()).default([]),
})
const CartResult = z.object({ ok: z.literal(true), data: z.object({ lines: z.array(CartLine) }) })

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()

/** Every expected line present with its quantity, variant and options, and nothing extra. */
function cartMatches(expected: z.infer<typeof ExpectedItem>[], actual: z.infer<typeof CartLine>[]): boolean {
  if (expected.length !== actual.length) return false
  const left = [...actual]
  for (const want of expected) {
    const i = left.findIndex((line) =>
      norm(line.name) === norm(want.name)
      && line.qty === want.qty
      && norm(line.variant ?? '') === norm(want.variant ?? '')
      && [...line.options].map(norm).sort().join('|') === [...want.options].map(norm).sort().join('|'))
    if (i === -1) return false
    left.splice(i, 1)
  }
  return true
}

type Outcome = {
  case: EvalCase
  ms: number
  errored: boolean
  itemOk: boolean | null
  intentOk: boolean
  got: string
}

async function runCase(outletId: string, lang: Lang, origin: string, c: EvalCase, failoversBefore: () => number): Promise<Outcome> {
  const before = failoversBefore()
  const started = await startCall({ outletId, transport: 'browser', lang, origin })
  const t = performance.now()
  let turn: Awaited<ReturnType<typeof takeTurn>>
  try {
    turn = await takeTurn(started.callId, { text: c.say, lang, confidence: 0.95 })
  } catch {
    await endCall(started.callId, 'eval').catch(() => undefined)
    return { case: c, ms: performance.now() - t, errored: true, itemOk: null, intentOk: false, got: 'threw' }
  }
  const ms = performance.now() - t
  const errored = failoversBefore() > before

  const succeeded = turn.toolCalls.filter((tc) => (tc.result as { ok?: boolean }).ok)
  const names = succeeded.map((tc) => tc.name)

  // The cart as of the last tool that reported one; no such tool means an empty cart.
  let lines: z.infer<typeof CartLine>[] = []
  for (const tc of succeeded) {
    const parsed = CartResult.safeParse(tc.result)
    if (parsed.success) lines = parsed.data.data.lines
  }

  const itemOk = c.expect.items ? cartMatches(c.expect.items, lines) : null
  const toolOk = c.expect.tool ? names.includes(c.expect.tool) : true
  // Intent is what the turn did: a cart means an order, an enquiry tool means an enquiry, a
  // transfer or an end means neither (Build Spec §5.2 classifies the first substantive turn).
  const observed = lines.length > 0 ? 'order' : names.includes('answer_enquiry') ? 'enquiry' : 'other'
  const intentOk = observed === c.intent && toolOk

  await endCall(started.callId, 'eval').catch(() => undefined)
  const cart = lines.map((l) => `${l.qty}× ${l.name}${l.variant ? ` (${l.variant})` : ''}${l.options.length ? ` +${l.options.join('+')}` : ''}`).join(', ')
  return { case: c, ms, errored, itemOk, intentOk, got: cart || names.join(', ') || '—' }
}

const flag = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? undefined : process.argv[i + 1]
}

const restaurant = await getRestaurantBySlug('demo')
if (!restaurant) throw new Error('No demo restaurant: run `npm run db:seed` first')
const outlet = restaurant.outlets[0]
if (!outlet) throw new Error('The demo restaurant has no outlet')

// A failover means the model did not answer; those cases are excluded rather than scored.
let failovers = 0
const warn = console.warn
console.warn = (...a: unknown[]) => { if (String(a[0]).includes('model failed')) failovers++; else warn(...a) }

const dir = join(process.cwd(), 'contracts', 'voice-eval')
const only = flag('lang')
const limit = Number(flag('limit') ?? Infinity)
const gap = Number(flag('gap') ?? 0)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const files = readdirSync(dir).filter((f) => f.endsWith('.json') && (!only || f === `${only}.json`))
if (files.length === 0) throw new Error(`No suites in contracts/voice-eval${only ? ` for ${only}` : ''}`)

const pct = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * p))] ?? 0
const rate = (n: number, d: number) => (d === 0 ? '   —  ' : `${((n / d) * 100).toFixed(0).padStart(3)}% `)

console.log(`provider ${process.env.LLM_PRIMARY_PROVIDER ?? '(vendor mode)'}\n`)
const summary: string[] = []

for (const file of files.sort()) {
  const suite = Suite.parse(JSON.parse(readFileSync(join(dir, file), 'utf8')))
  const cases = suite.cases.slice(0, limit)
  const results: Outcome[] = []
  console.log(`## ${suite.language} — ${cases.length} cases`)
  for (const c of cases) {
    if (gap) await sleep(gap)
    const r = await runCase(outlet.id, suite.language, 'http://localhost:3000', c, () => failovers)
    results.push(r)
    const mark = r.errored ? '!' : r.itemOk === false || !r.intentOk ? '✗' : '✓'
    console.log(`  ${mark} ${r.case.id.padEnd(22)} ${String(Math.round(r.ms)).padStart(6)}ms  ${r.case.say}`)
    if (mark === '✗') console.log(`      wanted ${JSON.stringify(r.case.expect)}  got ${r.got}`)
  }

  const scored = results.filter((r) => !r.errored)
  const itemCases = scored.filter((r) => r.itemOk !== null)
  const itemOk = itemCases.filter((r) => r.itemOk).length
  const intentOk = scored.filter((r) => r.intentOk).length
  const ms = scored.map((r) => r.ms)
  summary.push(
    `  ${suite.language}   item ${rate(itemOk, itemCases.length)}(${itemOk}/${itemCases.length})   `
    + `intent ${rate(intentOk, scored.length)}(${intentOk}/${scored.length})   `
    + `p50 ${String(Math.round(pct(ms, 0.5))).padStart(5)}ms  p95 ${String(Math.round(pct(ms, 0.95))).padStart(6)}ms`
    + (results.length - scored.length > 0 ? `   ${results.length - scored.length} errored` : ''),
  )
  console.log()
}

console.log('=== summary ===')
for (const line of summary) console.log(line)
console.log('\nBuild Spec §16 target for item accuracy: 85% at M2, 92% at M3, 95% after M4 tuning.')
console.log('Text only — no recogniser, no phone line, no kitchen noise. An upper bound.')
process.exit(0)
