import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { LlmMessage } from './index.ts'
import { fromAnthropicContent, toAnthropicMessages } from './anthropic.ts'

const conversation: LlmMessage[] = [
  { role: 'user', text: 'do masala dosa' },
  { role: 'assistant', text: 'Let me check.', toolCalls: [{ id: 'toolu_1', name: 'search_menu', args: { query: 'masala dosa', language: 'hi' } }] },
  { role: 'tool', results: [{ id: 'toolu_1', name: 'search_menu', result: { ok: true, data: [{ id: 'i1', name: 'Masala Dosa' }] } }] },
  { role: 'assistant', text: null, toolCalls: [{ id: 'toolu_2', name: 'add_to_cart', args: { item_id: 'i1', qty: 2 } }] },
]

test('LlmMessage → Anthropic MessageParam: user text, assistant blocks, tool results in one user turn', () => {
  assert.deepEqual(toAnthropicMessages(conversation), [
    { role: 'user', content: 'do masala dosa' },
    {
      role: 'assistant',
      content: [
        { type: 'text', text: 'Let me check.' },
        { type: 'tool_use', id: 'toolu_1', name: 'search_menu', input: { query: 'masala dosa', language: 'hi' } },
      ],
    },
    {
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: JSON.stringify({ ok: true, data: [{ id: 'i1', name: 'Masala Dosa' }] }) }],
    },
    { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_2', name: 'add_to_cart', input: { item_id: 'i1', qty: 2 } }] },
  ])
})

test('assistant content round-trips through the block reader, ids intact', () => {
  for (const index of [1, 3]) {
    const assistant = conversation[index]
    assert.ok(assistant?.role === 'assistant')
    const [param] = toAnthropicMessages([assistant])
    assert.ok(param && typeof param.content !== 'string')
    assert.deepEqual(fromAnthropicContent(param.content), { text: assistant.text, toolCalls: assistant.toolCalls })
  }
})

test('the reader joins text blocks and defaults a non-object tool input to {}', () => {
  assert.deepEqual(
    fromAnthropicContent([
      { type: 'text', text: 'Namaste' },
      { type: 'text', text: '!' },
      { type: 'tool_use', id: 'toolu_9', name: 'get_cart', input: null },
    ]),
    { text: 'Namaste!', toolCalls: [{ id: 'toolu_9', name: 'get_cart', args: {} }] },
  )
})
