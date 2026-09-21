/**
 * The call repo against a real PGlite (M2 design "Testing", acceptance 5: every call has a `call`
 * row, its `call_turn`s with tool calls, and a `call_cost` row). The summing upsert and the
 * seq ordering are the two things a mock would not catch.
 */

import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { eq } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { hashPhone } from '../../core/phone.ts'

// A fresh database per run; the dynamic imports keep client.ts from reading DATABASE_URL first.
process.env.DATABASE_URL = `file://${mkdtempSync(join(tmpdir(), 'serveline-calls-'))}`

const { db, schema } = await import('../client.ts')
const calls = await import('./calls.ts')

await migrate(db, { migrationsFolder: fileURLToPath(new URL('../migrations', import.meta.url)) })
after(() => db.$client.close())

const [restaurant] = await db.insert(schema.restaurant)
  .values({ name: 'Udupi Grand', slug: 'udupi-grand' }).returning()
assert.ok(restaurant)
const [outlet] = await db.insert(schema.outlet).values({
  restaurantId: restaurant.id, name: 'Indiranagar', addressLine: '100 Feet Road',
  area: 'Indiranagar', pincode: '560038',
}).returning()
assert.ok(outlet)

const agent = { type: 'platform' as const, id: '11111111-1111-4111-8111-111111111111' }
const phoneHash = hashPhone('+919876543210', 'test-pepper')

describe('calls', () => {
  it('a call: turns come back in seq order, two adds sum into one cost row, end is final', async () => {
    const c = await calls.createCall({ outletId: outlet.id, transport: 'browser', fromPhoneHash: phoneHash })
    assert.equal(c.outcome, null)
    assert.equal(c.intent, 'unknown')

    // Appended out of order on purpose: the read must sort by seq, not by insertion.
    await calls.appendTurn(c.id, { seq: 2, speaker: 'customer', text: 'do masala dosa', language: 'hi', asrConfidence: 0.91 })
    await calls.appendTurn(c.id, { seq: 1, speaker: 'ai', text: 'Namaste, Udupi Grand mein aapka swagat hai.' })
    const toolCalls = [{ name: 'add_to_cart', args: { item_id: 'x', qty: 2 }, result: { ok: true }, ms: 12 }]
    await calls.appendTurn(c.id, { seq: 3, speaker: 'ai', text: 'Do masala dosa, ₹240.', toolCalls })

    const first = await calls.addCost(c.id, { llmPaise: 30, tokensIn: 1200, tokensOut: 80 })
    assert.equal(first.totalPaise, 30)
    const second = await calls.addCost(c.id, { llmPaise: 45, tokensIn: 1500, tokensOut: 120, smsPaise: 20 })
    assert.deepEqual(
      [second.llmPaise, second.smsPaise, second.tokensIn, second.tokensOut, second.totalPaise],
      [75, 20, 2700, 200, 95],
    )

    const ended = await calls.endCall(c.id, {
      outcome: 'completed', intent: 'order', languageDetected: 'hi', durationSec: 42, countsTowardAllowance: true,
    })
    assert.equal(ended.outcome, 'completed')
    assert.equal(ended.intent, 'order')
    assert.ok(ended.endedAt)
    await assert.rejects(
      calls.endCall(c.id, { outcome: 'abandoned', durationSec: 50, countsTowardAllowance: false }),
      /already ended/,
    )

    const full = await calls.getCall(c.id)
    assert.ok(full)
    assert.deepEqual(full.turns.map((t) => t.seq), [1, 2, 3])
    assert.equal(full.turns[1]?.asrConfidence, 0.91)
    assert.deepEqual(full.turns[2]?.toolCalls, toolCalls)
    assert.equal(full.cost?.totalPaise, 95)
    assert.equal(full.outcome, 'completed', 'the second end did not overwrite the first')
    assert.equal(await calls.getCall('00000000-0000-4000-8000-000000000000'), null)
  })

  it('lists newest first with the ledger total, filtered by outlet, outcome and cursor', async () => {
    const [earlier] = await db.select().from(schema.call).orderBy(schema.call.startedAt)
    assert.ok(earlier)
    const later = await calls.createCall({ outletId: outlet.id, transport: 'browser' })
    await calls.endCall(later.id, { outcome: 'handoff', handoffReason: 'abuse', durationSec: 5, countsTowardAllowance: false })

    const listed = await calls.listCalls({ outletId: outlet.id, limit: 10 })
    assert.deepEqual(listed.map((r) => [r.id, r.totalPaise]), [[later.id, 0], [earlier.id, 95]])
    assert.deepEqual((await calls.listCalls({ outcome: 'handoff', limit: 10 })).map((r) => r.id), [later.id])
    assert.deepEqual((await calls.listCalls({ limit: 10, before: later.startedAt })).map((r) => r.id), [earlier.id])
    assert.equal((await calls.listCalls({ limit: 1 })).length, 1)
  })

  it('tagCall writes the tag and an audit row that names the call, nothing more', async () => {
    const c = await calls.createCall({ outletId: outlet.id, transport: 'browser' })
    const tagged = await calls.tagCall(c.id, 'misheard_item', agent)
    assert.equal(tagged.tag, 'misheard_item')
    const audits = await db.select().from(schema.auditLog).where(eq(schema.auditLog.entityId, c.id))
    assert.equal(audits.length, 1)
    assert.equal(audits[0]?.action, 'call.tag')
    assert.equal(audits[0]?.actorId, agent.id)
    assert.deepEqual(audits[0]?.before, { tag: null })
    assert.deepEqual(audits[0]?.after, { tag: 'misheard_item' })
    await assert.rejects(calls.tagCall('00000000-0000-4000-8000-000000000000', 'other', agent), /No call/)
  })

  it('refuses a phone number where the hash belongs', async () => {
    await assert.rejects(
      calls.createCall({ outletId: outlet.id, transport: 'exotel', fromPhoneHash: '+919876543210' }),
      /SHA-256/,
    )
  })

  it('the allowance counts Exotel calls with the flag inside the window; browser calls never', async () => {
    const [second] = await db.insert(schema.outlet).values({
      restaurantId: restaurant.id, name: 'Jayanagar', addressLine: '4th Block', area: 'Jayanagar', pincode: '560041',
    }).returning()
    assert.ok(second)
    const flagged = async (transport: 'browser' | 'exotel', countsTowardAllowance: boolean) => {
      const c = await calls.createCall({ outletId: second.id, transport })
      await calls.endCall(c.id, { outcome: 'completed', durationSec: 30, countsTowardAllowance })
      return c
    }
    const counted = await flagged('exotel', true)
    await flagged('exotel', false)
    await flagged('browser', true)
    const from = new Date(counted.startedAt.getTime() - 60_000)
    const to = new Date(counted.startedAt.getTime() + 60_000)
    assert.equal(await calls.countAllowanceCalls(second.id, from, to), 1)
    assert.equal(await calls.countAllowanceCalls(second.id, to, new Date(to.getTime() + 60_000)), 0, 'the window is [from, to)')
    assert.equal(await calls.countAllowanceCalls(outlet.id, from, to), 0, 'another outlet')

    const listed = await calls.listCalls({ outletId: second.id, transport: 'exotel', limit: 10 })
    assert.equal(listed.length, 2)
    assert.equal(listed[0]?.outletName, 'Jayanagar')
    assert.equal(listed[0]?.restaurantName, 'Udupi Grand')
    // The first test's call had one customer turn; these have none.
    assert.deepEqual((await calls.listCalls({ outletId: outlet.id, limit: 10 })).map((r) => r.callerTurns).sort(), [0, 0, 1])
  })

  it('listCallers gives a first name, a four-digit tail and the hash — never the number', async () => {
    const phone = '+919900000005'
    await db.insert(schema.customer).values({ phone, phoneHash: hashPhone(phone, 'test-pepper'), name: 'Priya Raghavan', preferredLanguage: 'kn' })
    await db.insert(schema.customer).values({ phone: '+919900000008', phoneHash: hashPhone('+919900000008', 'test-pepper') })
    const callers = await calls.listCallers()
    assert.deepEqual(callers.map((c) => [c.firstName, c.phoneTail, c.preferredLanguage]), [['Priya', '0005', 'kn'], [null, '0008', null]])
    assert.equal(callers[0]?.phoneHash, hashPhone(phone, 'test-pepper'))
    assert.ok(!JSON.stringify(callers).includes('+91'), 'no number in the projection')
  })
})
