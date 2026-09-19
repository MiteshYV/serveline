import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { UI_KEYS, orderStateLabel, orderStatesReviewed, reviewed, t } from './i18n.ts'
import type { Lang } from './i18n.ts'
import { ORDER_TRANSITIONS } from '../core/orders.ts'
import type { OrderStatus } from '../core/orders.ts'
import { formatDuration } from './time.ts'

const LANGS: readonly Lang[] = ['en', 'hi', 'kn']

test('every UI key has a non-empty string in all three languages', () => {
  for (const key of UI_KEYS) {
    for (const lang of LANGS) {
      assert.ok(t(key, lang).trim().length > 0, `${key} is empty in ${lang}`)
    }
  }
})

test('placeholders are the same set in every language of a key', () => {
  const holes = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',')
  for (const key of UI_KEYS) {
    const en = holes(t(key, 'en'))
    for (const lang of LANGS) assert.equal(holes(t(key, lang)), en, `${key} placeholders differ in ${lang}`)
  }
})

test('interpolation fills named placeholders and leaves unknown ones visible', () => {
  assert.equal(t('checkout.step', 'en', { n: 2, total: 3 }), 'Step 2 of 3')
  assert.equal(t('checkout.step', 'en', { n: 2 }), 'Step 2 of {total}')
})

test('every order status has a label in every language', () => {
  for (const status of Object.keys(ORDER_TRANSITIONS) as OrderStatus[]) {
    for (const lang of LANGS) assert.ok(orderStateLabel(status, 'delivery', lang).length > 0)
  }
})

// ADR 0002 §6: one state, three labels.
test('delivered varies by fulfilment; nothing else does', () => {
  assert.equal(orderStateLabel('delivered', 'delivery', 'en'), 'Delivered')
  assert.equal(orderStateLabel('delivered', 'dine_in', 'en'), 'Served')
  assert.equal(orderStateLabel('delivered', 'pickup', 'en'), 'Collected')
  assert.equal(orderStateLabel('ready', 'dine_in', 'en'), orderStateLabel('ready', 'delivery', 'en'))
})

// Design §4.2: no uppercase on anything translatable. A chip label is the state, not a shout.
test('no English state label is shouted', () => {
  for (const status of Object.keys(ORDER_TRANSITIONS) as OrderStatus[]) {
    const label = orderStateLabel(status, 'delivery', 'en')
    assert.notEqual(label, label.toUpperCase(), `${status} label is uppercase`)
  }
})

test('the reviewed flags mirror the contract file', () => {
  const json = JSON.parse(readFileSync(new URL('../../contracts/i18n/order-states.json', import.meta.url), 'utf8'))
  assert.deepEqual(orderStatesReviewed, json.reviewed)
  assert.equal(reviewed.en, true)
  assert.equal(reviewed.hi, false)
  assert.equal(reviewed.kn, false)
})

test('formatDuration renders the card timer and the resend countdown', () => {
  assert.equal(formatDuration(0), '00:00')
  assert.equal(formatDuration(252_000), '04:12')
  assert.equal(formatDuration(3_725_000), '1:02:05')
  assert.equal(formatDuration(24_000, { padMinutes: false }), '0:24')
  assert.equal(formatDuration(-5_000), '00:00')
})
