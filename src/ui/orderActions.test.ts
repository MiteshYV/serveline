import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ORDER_TRANSITIONS, canTransition, isTerminal } from '../core/orders.ts'
import type { Fulfilment, OrderStatus } from '../core/orders.ts'
import { primaryAction } from './orderActions.ts'

const ALL = Object.keys(ORDER_TRANSITIONS) as OrderStatus[]
const FULFILMENTS: readonly Fulfilment[] = ['delivery', 'pickup', 'dine_in']

test('every primary action is a legal transition under its fulfilment', () => {
  for (const status of ALL) {
    for (const f of FULFILMENTS) {
      const pick = primaryAction(status, f)
      if (pick) assert.ok(canTransition(status, pick.to, f), `${status} -> ${pick.to} (${f})`)
    }
  }
})

test('terminal states and address_pending offer no transition; every other state offers exactly one', () => {
  for (const status of ALL) {
    for (const f of FULFILMENTS) {
      const pick = primaryAction(status, f)
      if (isTerminal(status) || status === 'address_pending') assert.equal(pick, null, `${status} (${f})`)
      else assert.ok(pick, `${status} (${f}) has no primary action`)
    }
  }
})

test('ready hands over by fulfilment: rider for delivery, straight to delivered otherwise', () => {
  assert.deepEqual(primaryAction('ready', 'delivery'), { to: 'out_for_delivery', key: 'action.outForDelivery' })
  assert.deepEqual(primaryAction('ready', 'dine_in'), { to: 'delivered', key: 'action.markServed' })
  assert.deepEqual(primaryAction('ready', 'pickup'), { to: 'delivered', key: 'action.markCollected' })
})

test('a primary action is never cancel or needs_attention', () => {
  for (const status of ALL) {
    for (const f of FULFILMENTS) {
      const pick = primaryAction(status, f)
      if (pick) assert.ok(pick.to !== 'cancelled' && pick.to !== 'needs_attention', `${status} (${f})`)
    }
  }
})
