import assert from 'node:assert/strict'
import { test } from 'node:test'
import { LlmError, type LlmMessage } from './index.ts'
import { GEMINI_MODEL, fromGeminiParts, geminiLlm, toGeminiContents } from './gemini.ts'

const conversation: LlmMessage[] = [
  { role: 'user', text: 'do masala dosa' },
  { role: 'assistant', text: 'Let me check.', toolCalls: [{ id: 'search_menu-0', name: 'search_menu', args: { query: 'masala dosa', language: 'hi' } }] },
  { role: 'tool', results: [{ id: 'search_menu-0', name: 'search_menu', result: { ok: true, data: [{ id: 'i1', name: 'Masala Dosa' }] } }] },
  { role: 'assistant', text: null, toolCalls: [{ id: 'add_to_cart-0', name: 'add_to_cart', args: { item_id: 'i1', qty: 2 } }] },
]

test('LlmMessage → Gemini contents: roles, text and function parts', () => {
  assert.deepEqual(toGeminiContents(conversation), [
    { role: 'user', parts: [{ text: 'do masala dosa' }] },
    { role: 'model', parts: [{ text: 'Let me check.' }, { functionCall: { name: 'search_menu', args: { query: 'masala dosa', language: 'hi' } } }] },
    { role: 'user', parts: [{ functionResponse: { name: 'search_menu', response: { result: { ok: true, data: [{ id: 'i1', name: 'Masala Dosa' }] } } } }] },
    { role: 'model', parts: [{ functionCall: { name: 'add_to_cart', args: { item_id: 'i1', qty: 2 } } }] },
  ])
})

test('Gemini parts → text and tool calls round-trip an assistant message', () => {
  const assistant = conversation[1]
  assert.ok(assistant?.role === 'assistant')
  const [content] = toGeminiContents([assistant])
  assert.ok(content)
  const back = fromGeminiParts(content.parts as Parameters<typeof fromGeminiParts>[0])
  assert.deepEqual(back, { text: assistant.text, toolCalls: assistant.toolCalls })
})

test('parts with only text give no tool calls; thought parts and missing args are handled', () => {
  assert.deepEqual(fromGeminiParts([{ text: 'Namaste' }, { text: '!' }]), { text: 'Namaste!', toolCalls: [] })
  assert.deepEqual(fromGeminiParts([{ text: 'hidden', thought: true }, { functionCall: { name: 'get_cart' } }]), {
    text: null,
    toolCalls: [{ id: 'get_cart-0', name: 'get_cart', args: {} }],
  })
})

const request = {
  system: 'Language: en',
  messages: [{ role: 'user' as const, text: 'hello' }],
  tools: [{ name: 'get_cart', description: 'The cart', parameters: { type: 'object', properties: {} } }],
}

const okBody = {
  candidates: [{ content: { parts: [{ text: 'Hi! ' }, { functionCall: { name: 'get_cart', args: {} } }] } }],
  usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 5, totalTokenCount: 17 },
}

test('the request has the documented shape and the response is parsed; a 503 is retried once', async () => {
  const seen: { url: string; init: RequestInit }[] = []
  const statuses = [503, 200]
  const fetchImpl: typeof fetch = async (url, init) => {
    seen.push({ url: String(url), init: init ?? {} })
    const status = statuses.shift() ?? 200
    return new Response(JSON.stringify(status === 200 ? okBody : { error: { code: 503, message: 'overloaded' } }), { status })
  }

  const res = await geminiLlm('key-1', fetchImpl).complete(request)
  assert.equal(seen.length, 2)
  const [first] = seen
  assert.ok(first)
  assert.equal(first.url, `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`)
  assert.equal(new Headers(first.init.headers).get('x-goog-api-key'), 'key-1')
  const body = JSON.parse(String(first.init.body))
  assert.deepEqual(body.systemInstruction, { parts: [{ text: 'Language: en' }] })
  assert.deepEqual(body.tools, [{ functionDeclarations: [{ name: 'get_cart', description: 'The cart', parameters: { type: 'object', properties: {} } }] }])
  assert.deepEqual(body.toolConfig, { functionCallingConfig: { mode: 'AUTO' } })
  // ADR 0006: thinking costs seconds a phone call does not have.
  assert.deepEqual(body.generationConfig, { maxOutputTokens: 1024, thinkingConfig: { thinkingLevel: 'low' } })

  assert.deepEqual(res, {
    text: 'Hi! ',
    toolCalls: [{ id: 'get_cart-0', name: 'get_cart', args: {} }],
    usage: { tokensIn: 12, tokensOut: 5 },
    provider: 'gemini',
    model: GEMINI_MODEL,
  })
})

test('a 4xx throws once with the status and the error message, never the body', async () => {
  let calls = 0
  const fetchImpl: typeof fetch = async () => {
    calls++
    return new Response(JSON.stringify({ error: { code: 400, message: 'Invalid argument', status: 'INVALID_ARGUMENT', details: ['echo of prompt'] } }), { status: 400 })
  }
  await assert.rejects(geminiLlm('key', fetchImpl).complete(request), (err: unknown) => {
    assert.ok(err instanceof LlmError)
    assert.equal(err.status, 400)
    assert.equal(err.provider, 'gemini')
    assert.equal(err.message, 'gemini 400: Invalid argument')
    return true
  })
  assert.equal(calls, 1)
})
