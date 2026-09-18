import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  IllegalTransitionError,
  ORDER_TRANSITIONS,
  assertTransition,
  canTransition,
  isTerminal,
  nextStatuses,
  requiresReason,
} from './orders.ts'
import type { OrderStatus } from './orders.ts'

const ALL = Object.keys(ORDER_TRANSITIONS) as OrderStatus[]
const NON_TERMINAL = ALL.filter((s) => !isTerminal(s))

test('every transition in the table is legal and does not throw', () => {
  for (const from of ALL) {
    for (const to of ORDER_TRANSITIONS[from]) {
      assert.ok(canTransition(from, to), `${from} -> ${to} should be legal`)
      assert.doesNotThrow(() => assertTransition(from, to))
    }
  }
})

test('the happy path runs end to end', () => {
  const path: OrderStatus[] = [
    'received', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered',
  ]
  for (let i = 0; i < path.length - 1; i++) {
    const from = path[i]
    const to = path[i + 1]
    assert.ok(from && to)
    assert.ok(canTransition(from, to), `${from} -> ${to}`)
  }
})

test('the two branch entries into confirmed are legal', () => {
  // Build Spec §4: voice orders with a rough address, and UPI link orders.
  assert.ok(canTransition('received', 'address_pending'))
  assert.ok(canTransition('address_pending', 'confirmed'))
  assert.ok(canTransition('received', 'awaiting_payment'))
  assert.ok(canTransition('awaiting_payment', 'confirmed'))
})

test('illegal transitions are refused and throw a named error', () => {
  const illegal: [OrderStatus, OrderStatus][] = [
    ['delivered', 'preparing'],
    ['delivered', 'cancelled'],
    ['delivered', 'needs_attention'],
    ['cancelled', 'confirmed'],
    ['cancelled', 'received'],
    ['cancelled', 'needs_attention'],
    ['received', 'delivered'],
    ['received', 'ready'],
    ['preparing', 'out_for_delivery'],
    ['confirmed', 'received'],
  ]

  for (const [from, to] of illegal) {
    assert.equal(canTransition(from, to), false, `${from} -> ${to} should be illegal`)
    assert.throws(
      () => assertTransition(from, to),
      (error: unknown) => {
        assert.ok(error instanceof IllegalTransitionError)
        assert.equal(error.from, from)
        assert.equal(error.to, to)
        assert.ok(error.message.includes(from) && error.message.includes(to))
        return true
      },
    )
  }
})

test('a status never transitions to itself', () => {
  for (const from of ALL) assert.equal(canTransition(from, from), false, from)
})

test('cancellation is available from every non-terminal state, and needs a reason', () => {
  for (const from of NON_TERMINAL) {
    assert.ok(canTransition(from, 'cancelled'), `${from} -> cancelled`)
  }
  assert.ok(requiresReason('cancelled'))
  assert.equal(requiresReason('delivered'), false)
  assert.equal(requiresReason('needs_attention'), false)
})

test('needs_attention is reachable from every non-terminal state', () => {
  for (const from of NON_TERMINAL) {
    if (from === 'needs_attention') continue
    assert.ok(canTransition(from, 'needs_attention'), `${from} -> needs_attention`)
  }
  // Staff then complete the order by hand or cancel it (Build Spec §4).
  assert.deepEqual(nextStatuses('needs_attention', 'delivery'), ['confirmed', 'cancelled'])
})

test('delivered and cancelled are terminal, and nothing else is', () => {
  assert.ok(isTerminal('delivered'))
  assert.ok(isTerminal('cancelled'))
  for (const status of NON_TERMINAL) assert.equal(isTerminal(status), false, status)
  assert.deepEqual(NON_TERMINAL.length, ALL.length - 2)
})

test('nextStatuses offers the rider leg to delivery only', () => {
  assert.deepEqual(nextStatuses('ready', 'delivery'), [
    'out_for_delivery', 'cancelled', 'needs_attention',
  ])
  assert.deepEqual(nextStatuses('ready', 'pickup'), ['delivered', 'cancelled', 'needs_attention'])
  assert.deepEqual(nextStatuses('ready', 'dine_in'), ['delivered', 'cancelled', 'needs_attention'])

  for (const from of ALL) {
    for (const fulfilment of ['pickup', 'dine_in'] as const) {
      assert.ok(
        !nextStatuses(from, fulfilment).includes('out_for_delivery'),
        `${from} (${fulfilment}) should not offer out_for_delivery`,
      )
    }
  }
})

test('nextStatuses never invents a transition the table refuses', () => {
  for (const from of ALL) {
    for (const fulfilment of ['delivery', 'pickup', 'dine_in'] as const) {
      for (const to of nextStatuses(from, fulfilment)) {
        assert.ok(canTransition(from, to), `${from} -> ${to} (${fulfilment})`)
      }
    }
  }
  assert.deepEqual(nextStatuses('delivered', 'delivery'), [])
  assert.deepEqual(nextStatuses('cancelled', 'pickup'), [])
})
