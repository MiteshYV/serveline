import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { llm } from './index.ts'
import { mockLlmAdapter } from './mock.ts'
import { GEMINI_MODEL } from './gemini.ts'

const VARS = ['VENDOR_MODE', 'LLM_PRIMARY_PROVIDER', 'LLM_PRIMARY_API_KEY', 'LLM_SECONDARY_PROVIDER', 'LLM_SECONDARY_API_KEY'] as const
const saved = Object.fromEntries(VARS.map((v) => [v, process.env[v]]))

function setEnv(values: Partial<Record<(typeof VARS)[number], string>>) {
  for (const v of VARS) {
    if (values[v] === undefined) delete process.env[v]
    else process.env[v] = values[v]
  }
}

afterEach(() => setEnv(saved))

test('VENDOR_MODE=mock with no provider named is the mock; live is not configured', () => {
  setEnv({ VENDOR_MODE: 'mock' })
  assert.equal(llm('primary'), mockLlmAdapter)
  assert.equal(llm('secondary'), mockLlmAdapter)
  setEnv({ VENDOR_MODE: 'live' })
  assert.throws(() => llm('primary'), /not configured: LLM_PRIMARY_PROVIDER/)
  assert.throws(() => llm('secondary'), /not configured: LLM_SECONDARY_PROVIDER/)
})

test('a provider named without its key fails loudly, whatever the mode', () => {
  setEnv({ VENDOR_MODE: 'mock', LLM_PRIMARY_PROVIDER: 'gemini', LLM_SECONDARY_PROVIDER: 'anthropic' })
  assert.throws(() => llm('primary'), /not configured: LLM_PRIMARY_API_KEY/)
  assert.throws(() => llm('secondary'), /not configured: LLM_SECONDARY_API_KEY/)
})

test('a provider named with its key is selected; "mock" and unknown names are handled', () => {
  setEnv({ LLM_PRIMARY_PROVIDER: 'gemini', LLM_PRIMARY_API_KEY: 'g', LLM_SECONDARY_PROVIDER: 'anthropic', LLM_SECONDARY_API_KEY: 'a' })
  assert.equal(llm('primary').provider, 'gemini')
  assert.equal(llm('primary').model, GEMINI_MODEL)
  assert.equal(llm('secondary').provider, 'anthropic')
  assert.equal(llm('secondary').model, 'claude-haiku-4-5')

  setEnv({ VENDOR_MODE: 'live', LLM_PRIMARY_PROVIDER: 'mock' })
  assert.equal(llm('primary'), mockLlmAdapter)
  setEnv({ LLM_PRIMARY_PROVIDER: 'openai', LLM_PRIMARY_API_KEY: 'x' })
  assert.throws(() => llm('primary'), /LLM_PRIMARY_PROVIDER must be/)
})
