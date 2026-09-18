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
import type { Fulfilment, OrderStatus } from './orders.ts'

const ALL = Object.keys(ORDER_TRANSITIONS) as OrderStatus[]
const NON_TERMINAL = ALL.filter((s) => !isTerminal(s))
const FULFILMENTS: readonly Fulfilment[] = ['delivery', 'pickup', 'dine_in']

test('every entry in the table is reachable under at least one fulfilment', () => {
  for (const from of ALL) {
    for (const to of ORDER_TRANSITIONS[from]) {
      const legalSomewhere = FULFILMENTS.some((f) => canTransition(from, to, f))
      assert.ok(legalSomewhere, `${from} -> ${to} is in the table but no fulfilment permits it`)
    }
  }
})

test('the delivery happy path runs end to end', () => {
  const path: OrderStatus[] = [
    'received', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered',
  ]
  for (let i = 0; i < path.length - 1; i++) {
    const from = path[i]
    const to = path[i + 1]
    assert.ok(from && to)
    assert.doesNotThrow(() => assertTransition(from, to, 'delivery'), `${from} -> ${to}`)
  }
})

test('the pickup and dine-in happy path hands over straight from ready', () => {
  for (const f of ['pickup', 'dine_in'] as const) {
    assert.ok(canTransition('ready', 'delivered', f), f)
  }
})

test('the two branch entries into confirmed are legal', () => {
  // Build Spec §4: voice orders with a rough address, and UPI link orders.
  assert.ok(canTransition('received', 'address_pending', 'delivery'))
  assert.ok(canTransition('address_pending', 'confirmed', 'delivery'))
  assert.ok(canTransition('received', 'awaiting_payment', 'dine_in'))
  assert.ok(canTransition('awaiting_payment', 'confirmed', 'dine_in'))
})

test('illegal transitions are refused and throw a named error', () => {
  const illegal: [OrderStatus, OrderStatus, Fulfilment][] = [
    ['delivered', 'preparing', 'delivery'],
    ['delivered', 'cancelled', 'delivery'],
    ['delivered', 'needs_attention', 'delivery'],
    ['cancelled', 'confirmed', 'pickup'],
    ['cancelled', 'received', 'pickup'],
    ['cancelled', 'needs_attention', 'pickup'],
    ['received', 'delivered', 'delivery'],
    ['received', 'ready', 'dine_in'],
    ['preparing', 'out_for_delivery', 'delivery'],
    ['confirmed', 'received', 'delivery'],
  ]

  for (const [from, to, fulfilment] of illegal) {
    assert.equal(canTransition(from, to, fulfilment), false, `${from} -> ${to} should be illegal`)
    assert.throws(
      () => assertTransition(from, to, fulfilment),
      (error: unknown) => {
        assert.ok(error instanceof IllegalTransitionError)
        assert.equal(error.from, from)
        assert.equal(error.to, to)
        assert.equal(error.fulfilment, fulfilment)
        assert.ok(error.message.includes(from) && error.message.includes(to))
        return true
      },
    )
  }
})

// The enforcement point knows the rider rule, not just the dashboard's button list.
test('fulfilment is enforced, not advisory', () => {
  assert.equal(canTransition('ready', 'delivered', 'delivery'), false, 'delivery must go out with a rider')
  assert.throws(() => assertTransition('ready', 'delivered', 'delivery'), IllegalTransitionError)

  for (const f of ['pickup', 'dine_in'] as const) {
    assert.equal(canTransition('ready', 'out_for_delivery', f), false, `${f} has no rider leg`)
    assert.throws(() => assertTransition('ready', 'out_for_delivery', f), IllegalTransitionError)
  }
})

test('a status never transitions to itself', () => {
  for (const from of ALL) {
    for (const f of FULFILMENTS) assert.equal(canTransition(from, from, f), false, `${from} (${f})`)
  }
})

test('cancellation is available from every non-terminal state, and needs a reason', () => {
  for (const from of NON_TERMINAL) {
    for (const f of FULFILMENTS) assert.ok(canTransition(from, 'cancelled', f), `${from} -> cancelled (${f})`)
  }
  assert.ok(requiresReason('cancelled'))
  assert.equal(requiresReason('delivered'), false)
  assert.equal(requiresReason('needs_attention'), false)
})

test('needs_attention is reachable from every non-terminal state', () => {
  for (const from of NON_TERMINAL) {
    if (from === 'needs_attention') continue
    assert.ok(canTransition(from, 'needs_attention', 'delivery'), `${from} -> needs_attention`)
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
    for (const fulfilment of FULFILMENTS) {
      for (const to of nextStatuses(from, fulfilment)) {
        assert.ok(ORDER_TRANSITIONS[from].includes(to), `${from} -> ${to} (${fulfilment})`)
      }
    }
  }
  assert.deepEqual(nextStatuses('delivered', 'delivery'), [])
  assert.deepEqual(nextStatuses('cancelled', 'pickup'), [])
})
