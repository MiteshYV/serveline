import { vendorMode } from '../mode.ts'
import { anthropicLlm } from './anthropic.ts'
import { geminiLlm } from './gemini.ts'
import { mockLlmAdapter } from './mock.ts'
import { ollamaLlm } from './ollama.ts'

/**
 * The LLM behind the call assistant. Build Spec §9 "LLM": an adapter interface with two providers
 * wired from the start so a vendor outage is a config change; tokens logged per call to
 * `call_cost`; no phone numbers or full addresses in prompts (that is prompt.ts's job — the
 * adapter sends what it is given).
 *
 * M2 design §"Adapters": Gemini over its REST API with `fetch`, Anthropic over the official SDK,
 * and a scripted mock that drives the whole product without a key. Failover between primary and
 * secondary lives in loop.ts, not here: an adapter either answers or throws.
 *
 * Messages are provider-neutral. A `tool` message carries the results of the tool calls in the
 * assistant message before it, keyed by the ids that message assigned.
 */
export type ToolSpec = { name: string; description: string; parameters: Record<string, unknown> }

export type ToolCall = {
  id: string
  name: string
  args: Record<string, unknown>
  /**
   * Whatever the provider needs handed back with this call, opaque to everyone else. Gemini 3
   * requires its `thoughtSignature` echoed on the model turn or it rejects the next request; the
   * loop stores messages and replays them, so it carries this without knowing what is in it.
   */
  meta?: Record<string, unknown>
}

export type LlmMessage =
  | { role: 'user'; text: string }
  | { role: 'assistant'; text: string | null; toolCalls: ToolCall[] }
  | { role: 'tool'; results: { id: string; name: string; result: unknown }[] }

export type LlmRequest = { system: string; messages: LlmMessage[]; tools: ToolSpec[]; maxTokens?: number }

export type LlmResponse = {
  text: string | null
  toolCalls: ToolCall[]
  usage: { tokensIn: number; tokensOut: number }
  provider: string
  model: string
}

export interface LlmAdapter {
  readonly provider: string
  readonly model: string
  complete(req: LlmRequest): Promise<LlmResponse>
}

/**
 * What a real provider throws. One shape for both so loop.ts can count a strike and log
 * `provider` and `status` with the call id — never the request, which carries the transcript
 * (CLAUDE.md, no PII in logs). `status` is undefined when the request never got an HTTP answer.
 */
export class LlmError extends Error {
  readonly provider: string
  readonly status: number | undefined

  constructor(provider: string, status: number | undefined, message: string, options?: ErrorOptions) {
    super(`${provider} ${status ?? 'network'}: ${message}`, options)
    this.name = 'LlmError'
    this.provider = provider
    this.status = status
  }
}

type Provider = 'gemini' | 'anthropic' | 'ollama' | 'mock' | 'failing'

/**
 * A test hook, and only that: `LLM_PRIMARY_PROVIDER=failing` (or SECONDARY) selects an adapter
 * that always throws, so loop.test.ts can drive Build Spec §5.3's outage rule — two failures →
 * the secondary provider, two more → transfer `vendor_error` (M2 design, acceptance 6) — without
 * a network or an invalid key. It needs no key and is honoured in any VENDOR_MODE, like `mock`.
 * Deliberately absent from .env.example: nothing outside a test should set it, and if something
 * does, every call transfers on its first turn, which is loud enough to notice.
 */
export const failingLlmAdapter: LlmAdapter = {
  provider: 'failing',
  model: 'always-throws',
  complete: async () => {
    throw new LlmError('failing', 503, 'scripted failure (LLM_*_PROVIDER=failing)')
  },
}

/**
 * `LLM_PRIMARY_PROVIDER` / `LLM_SECONDARY_PROVIDER` name the provider, `LLM_*_API_KEY` its key
 * (.env.example). A named provider is used whatever VENDOR_MODE says — the model is the one
 * vendor worth trying for real while payments and SMS stay mocked — but a name without its key
 * is an error, never a quiet mock (CLAUDE.md). With no provider named, VENDOR_MODE decides:
 * mock → the scripted mock; live → not configured.
 */
export function llm(which: 'primary' | 'secondary'): LlmAdapter {
  const providerVar = `LLM_${which.toUpperCase()}_PROVIDER`
  const keyVar = `LLM_${which.toUpperCase()}_API_KEY`
  const provider = process.env[providerVar]

  if (!provider) {
    if (vendorMode() === 'mock') return mockLlmAdapter
    throw new Error(`not configured: ${providerVar}`)
  }
  if (provider === 'mock') return mockLlmAdapter
  if (provider === 'failing') return failingLlmAdapter
  // A model on this machine: no key to check, and the host is the only thing that could be wrong.
  if (provider === 'ollama') return ollamaLlm()

  const key = process.env[keyVar]
  if (!key) throw new Error(`not configured: ${keyVar}`)

  switch (provider as Provider) {
    case 'gemini':
      return geminiLlm(key)
    case 'anthropic':
      return anthropicLlm(key)
    default:
      throw new Error(`${providerVar} must be "gemini", "anthropic" or "mock", received "${provider}"`)
  }
}
