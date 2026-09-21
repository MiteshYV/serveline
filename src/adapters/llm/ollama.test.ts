import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { LlmMessage } from './index.ts'
import { toOllamaMessages } from './ollama.ts'

test('a conversation maps to Ollama\'s message list, one message per tool result', () => {
  const messages: LlmMessage[] = [
    { role: 'user', text: 'ek masala dosa' },
    { role: 'assistant', text: null, toolCalls: [
      { id: 'search_menu-0', name: 'search_menu', args: { query: 'masala dosa', language: 'hi' } },
      { id: 'search_menu-1', name: 'search_menu', args: { query: 'filter coffee', language: 'hi' } },
    ] },
    { role: 'tool', results: [
      { id: 'search_menu-0', name: 'search_menu', result: { ok: true, data: { items: [] } } },
      { id: 'search_menu-1', name: 'search_menu', result: { ok: true, data: { items: [] } } },
    ] },
    { role: 'assistant', text: 'जोड़ दिया।', toolCalls: [] },
  ]

  assert.deepEqual(toOllamaMessages('You take orders.', messages), [
    { role: 'system', content: 'You take orders.' },
    { role: 'user', content: 'ek masala dosa' },
    {
      role: 'assistant',
      content: '',
      tool_calls: [
        { function: { name: 'search_menu', arguments: { query: 'masala dosa', language: 'hi' } } },
        { function: { name: 'search_menu', arguments: { query: 'filter coffee', language: 'hi' } } },
      ],
    },
    // Ollama matches a result to its call by name, not by id, so each result is its own message.
    { role: 'tool', tool_name: 'search_menu', content: '{"ok":true,"data":{"items":[]}}' },
    { role: 'tool', tool_name: 'search_menu', content: '{"ok":true,"data":{"items":[]}}' },
    { role: 'assistant', content: 'जोड़ दिया।' },
  ])
})

test('an assistant turn with no tool calls carries no tool_calls key', () => {
  const [, only] = toOllamaMessages('s', [{ role: 'assistant', text: 'hello', toolCalls: [] }])
  assert.deepEqual(only, { role: 'assistant', content: 'hello' })
})
