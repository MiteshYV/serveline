import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { LlmMessage, ToolCall } from './index.ts'
import { decide, mockLlmAdapter, usualOrderOf } from './mock.ts'

/**
 * A three-line stand-in for tools.ts: the shapes here are the ones the mock reads tolerantly
 * (search hits with id/name/variants, a Cart with lines and totalPaise, a ToolResult envelope).
 */
const MENU = [
  { id: 'i-dosa', name: 'Masala Dosa', pricePaise: 9000, variants: [], optionGroups: [] },
  { id: 'i-coffee', name: 'Filter Coffee', pricePaise: 3000, variants: [{ id: 'v-reg', name: 'Regular' }, { id: 'v-large', name: 'Large' }], optionGroups: [] },
  { id: 'i-pbm', name: 'Paneer Butter Masala', pricePaise: 24000, variants: [{ id: 'v-half', name: 'Half' }, { id: 'v-full', name: 'Full' }], optionGroups: [] },
]

type Line = { itemName: string; variantName: string | null; qty: number }

function fakeTools() {
  const cart: Line[] = []
  const calls: ToolCall[] = []
  const view = () => ({ lines: cart, totalPaise: cart.length * 9000 })
  return {
    calls,
    cart,
    run(call: ToolCall): unknown {
      calls.push(call)
      switch (call.name) {
        case 'search_menu': {
          const q = String(call.args.query).toLowerCase()
          return { ok: true, data: MENU.filter((m) => m.name.toLowerCase().includes(q)) }
        }
        case 'add_to_cart': {
          const item = MENU.find((m) => m.id === call.args.item_id)
          if (!item) return { ok: false, reason: 'unknown_item' }
          const variant = item.variants.find((v) => v.id === call.args.variant_id)
          cart.push({ itemName: item.name, variantName: variant?.name ?? null, qty: Number(call.args.qty) })
          return { ok: true, data: view() }
        }
        case 'get_cart':
          return { ok: true, data: view() }
        case 'place_order':
          return { ok: true, data: { orderId: 'o-1' } }
        default:
          return { ok: true, data: { ended: true } }
      }
    },
  }
}

/** The loop in miniature: call the model until it answers in prose (design §"The turn"). */
function turn(system: string, history: LlmMessage[], text: string, tools: ReturnType<typeof fakeTools>): string {
  history.push({ role: 'user', text })
  for (let round = 0; round < 4; round++) {
    const res = decide({ system, messages: history, tools: [] })
    history.push({ role: 'assistant', text: res.text, toolCalls: res.toolCalls })
    if (res.toolCalls.length === 0) return res.text ?? ''
    history.push({ role: 'tool', results: res.toolCalls.map((c) => ({ id: c.id, name: c.name, result: tools.run(c) })) })
  }
  throw new Error('the mock did not answer within four rounds')
}

test('a Hindi three-item order with a variant is placed for pickup', () => {
  const system = 'You are the assistant.\nLanguage: hi\n'
  const tools = fakeTools()
  const history: LlmMessage[] = []

  assert.equal(turn(system, history, 'namaste', tools), 'आप क्या ऑर्डर करना चाहेंगे?')
  assert.equal(tools.calls.length, 0)

  assert.match(turn(system, history, 'do masala dosa', tools), /2 × Masala Dosa/)
  assert.deepEqual(tools.calls.map((c) => c.name), ['search_menu', 'add_to_cart'])
  assert.deepEqual(tools.calls[0]?.args, { query: 'masala dosa', language: 'hi' })
  assert.deepEqual(tools.calls[1]?.args, { item_id: 'i-dosa', qty: 2 })

  assert.match(turn(system, history, 'ek filter coffee large', tools), /1 × Filter Coffee \(Large\)/)
  assert.deepEqual(tools.calls[3]?.args, { item_id: 'i-coffee', qty: 1, variant_id: 'v-large' })

  assert.match(turn(system, history, 'paneer butter masala aadha', tools), /Paneer Butter Masala \(Half\)/)
  assert.deepEqual(tools.calls[5]?.args, { item_id: 'i-pbm', qty: 1, variant_id: 'v-half' })

  const readBack = turn(system, history, 'bas', tools)
  assert.equal(tools.calls[6]?.name, 'get_cart')
  assert.match(readBack, /2 × Masala Dosa, 1 × Filter Coffee \(Large\), 1 × Paneer Butter Masala \(Half\) — ₹270\.00/)
  assert.match(readBack, /पिकअप या डिलीवरी/)

  assert.equal(turn(system, history, 'pickup', tools), 'आपका ऑर्डर लग गया। पेमेंट लिंक SMS से आ रहा है। धन्यवाद!')
  assert.deepEqual(tools.calls.at(-1), { id: tools.calls.at(-1)?.id, name: 'place_order', args: { fulfilment: 'pickup', payment_method: 'upi_link' } })
})

test('a delivery order in English, with a code, goes through place_order(delivery, upi_link)', () => {
  const system = 'Language: en'
  const tools = fakeTools()
  const history: LlmMessage[] = []
  assert.match(turn(system, history, 'I want 3 masala dosa please', tools), /3 × Masala Dosa/)
  assert.equal(turn(system, history, 'KTR2024', tools), 'Code applied. Anything else?')
  assert.deepEqual(tools.calls.at(-1)?.args, { code: 'KTR2024' })
  assert.match(turn(system, history, "that's all", tools), /pickup or delivery\?$/)
  assert.equal(turn(system, history, 'delivery', tools), 'Your order is placed. The payment link is on its way by SMS. Thank you!')
  assert.deepEqual(tools.calls.at(-1)?.args, { fulfilment: 'delivery', payment_method: 'upi_link' })
})

test('"same as last time" searches every usual item and adds each with its quantity', () => {
  const system = 'Language: en\nUsual order: 2 × Masala Dosa, 1 × Filter Coffee\n'
  const tools = fakeTools()
  const history: LlmMessage[] = []
  const reply = turn(system, history, 'yes', tools)
  assert.deepEqual(tools.calls.map((c) => [c.name, c.args]), [
    ['search_menu', { query: 'Masala Dosa', language: 'en' }],
    ['search_menu', { query: 'Filter Coffee', language: 'en' }],
    ['add_to_cart', { item_id: 'i-dosa', qty: 2 }],
    ['add_to_cart', { item_id: 'i-coffee', qty: 1 }],
  ])
  assert.match(reply, /2 × Masala Dosa, 1 × Filter Coffee/)
  assert.match(turn(system, history, 'pickup', tools), /placed/)

  assert.deepEqual(usualOrderOf('Usual order: Idli Vada x 3, 2 Set Dosa'), [{ name: 'Idli Vada', qty: 3 }, { name: 'Set Dosa', qty: 2 }])
  // prompt.ts puts the price and the "on a yes" guidance after a `;` on the same line — not items.
  assert.deepEqual(
    usualOrderOf('- Usual order: Masala Dosa × 2, Filter Coffee × 2; ₹300 at today\'s prices. On a yes, search_menu and add_to_cart each item.'),
    [{ name: 'Masala Dosa', qty: 2 }, { name: 'Filter Coffee', qty: 2 }],
  )
  assert.deepEqual(usualOrderOf('nothing here'), [])
})

test('handoff, goodbye, enquiries and an unknown item', () => {
  const tools = fakeTools()
  assert.equal(turn('', [], 'I want to talk to someone', tools), 'Connecting you to the restaurant.')
  assert.deepEqual(tools.calls.at(-1)?.args, { reason: 'customer_request' })
  assert.equal(turn('', [], 'bye', tools), 'Goodbye!')
  assert.deepEqual(tools.calls.at(-1)?.args, { reason: 'customer_done' })
  turn('', [], 'what time do you close', tools)
  assert.deepEqual(tools.calls.at(-1)?.args, { kind: 'hours' })
  turn('', [], 'do you deliver to Indiranagar', tools)
  assert.deepEqual(tools.calls.at(-1)?.args, { kind: 'delivery' })
  assert.equal(turn('Language: kn', [], 'pizza', tools), 'ಅದು ಮೆನುವಿನಲ್ಲಿ ಸಿಗಲಿಲ್ಲ. ಬೇರೆ ಏನಾದರೂ?')
  assert.equal(turn('Language: en', [], 'yes', tools), 'What would you like to order?')
})

test('usage counts words and the adapter wraps decide', async () => {
  const res = await mockLlmAdapter.complete({ system: 'one two three', messages: [{ role: 'user', text: 'four five' }], tools: [] })
  assert.equal(res.usage.tokensIn, 5)
  assert.ok(res.usage.tokensOut > 0)
  assert.equal(res.provider, 'mock')
})
