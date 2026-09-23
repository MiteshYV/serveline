/**
 * Print every tool call one utterance produces, in order, with the round it landed in.
 *
 * The eval harness scores the cart at the end of a turn; when the cart is wrong it cannot say
 * whether the assistant misheard the caller or simply ran out of tool rounds before it finished
 * adding. This prints the sequence, which distinguishes the two immediately.
 *
 *   npm run trace -- --say "ek masala dosa aur do chai" --lang hi
 *   npm run trace -- --case kn-order-long
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { phonePepper } from '../auth/secrets.ts'
import { SYSTEM } from '../db/repos/_actor.ts'
import { NOTICE_VERSION } from '../core/consent.ts'
import { hashPhone } from '../core/phone.ts'
import { getConsent, getRestaurantBySlug, recordConsent, upsertCustomer } from '../db/repos/index.ts'
import type { Lang } from '../ui/i18n.ts'
import { endCall, startCall, takeTurn } from './loop.ts'

const flag = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? undefined : process.argv[i + 1]
}

const dir = join(process.cwd(), 'contracts', 'voice-eval')

/** `--case <id>` looks the utterance up in the eval suites so the trace matches what was scored. */
function fromSuites(id: string): { say: string; lang: Lang } {
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    const suite = JSON.parse(readFileSync(join(dir, file), 'utf8')) as {
      language: Lang
      cases: { id: string; say: string }[]
    }
    const found = suite.cases.find((c) => c.id === id)
    if (found) return { say: found.say, lang: suite.language }
  }
  throw new Error(`No case with id ${id}`)
}

const caseId = flag('case')
const { say, lang } = caseId
  ? fromSuites(caseId)
  : { say: flag('say') ?? '', lang: (flag('lang') ?? 'en') as Lang }
if (!say) throw new Error('Pass --say "<utterance>" or --case <id>')

const restaurant = await getRestaurantBySlug('demo')
if (!restaurant) throw new Error('No demo restaurant: run `npm run db:seed` first')
const outlet = restaurant.outlets[0]
if (!outlet) throw new Error('The demo restaurant has no outlet')

// The same caller the eval uses: consent, no name, no history — so the greeting cannot steer the
// turn being measured and the trace is comparable with an eval run.
const phone = '+919900009999'
const phoneHash = hashPhone(phone, phonePepper())
const customer = await upsertCustomer({ phone, phoneHash }, SYSTEM)
if (!(await getConsent(customer.id, restaurant.id))) {
  await recordConsent({
    customerId: customer.id, restaurantId: restaurant.id, noticeVersion: NOTICE_VERSION,
    purposes: ['order_fulfilment', 'order_history'], channel: 'call', language: 'en',
    evidence: { source: 'voice-trace' },
  }, SYSTEM)
}

const started = await startCall({ outletId: outlet.id, transport: 'browser', lang, origin: 'http://localhost:3000', customerPhoneHash: phoneHash })
console.log(`\n${caseId ?? '(ad hoc)'} · ${lang}\n  "${say}"\n`)

const turn = await takeTurn(started.callId, { text: say, lang, confidence: 0.95 })

console.log(`tool calls: ${turn.toolCalls.length}`)
for (const [i, tc] of turn.toolCalls.entries()) {
  const result = tc.result as { ok?: boolean; reason?: string; data?: unknown }
  const mark = result.ok ? '✓' : '✗'
  const args = JSON.stringify(tc.args)
  const summary = result.ok
    ? JSON.stringify(result.data).slice(0, 110)
    : `refused: ${result.reason ?? 'unknown'}`
  console.log(`  ${String(i + 1).padStart(2)}. ${mark} ${tc.name.padEnd(18)} ${args.slice(0, 90)}`)
  console.log(`      → ${summary}`)
}

console.log(`\nspoken reply: ${turn.reply}`)

await endCall(started.callId, 'trace').catch(() => undefined)
process.exit(0)
