import { z } from 'zod'
import { LlmError, type LlmAdapter, type LlmMessage, type ToolCall } from './index.ts'

/**
 * A model running on this machine, through Ollama's native chat API. Not in Build Spec §3, which
 * assumes a hosted vendor — this exists because a hosted one has a rate limit and a bill, and a
 * demo on a laptop has neither (ADR 0007).
 *
 *   POST /api/chat   { model, messages, tools, stream: false, think: false, options: { num_predict } }
 *   messages: { role: 'system' | 'user' | 'assistant' | 'tool', content, tool_calls?, tool_name? }
 *   → { message: { content, tool_calls: [{ function: { name, arguments } }] },
 *       prompt_eval_count, eval_count }
 *
 * Ollama's tool calls carry no id and it matches a tool result by name, like Gemini; the ids here
 * are minted for our own bookkeeping. Checked against ollama.com/blog/tool-support on
 * 22 September 2026.
 */
export const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? 'qwen3:8b'
const HOST = process.env.OLLAMA_HOST ?? 'http://127.0.0.1:11434'

/** A local model is slower to first token than a hosted one and never rate-limits; wait for it. */
const TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS ?? 120_000)

type OllamaMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  tool_calls?: { function: { name: string; arguments: Record<string, unknown> } }[]
  tool_name?: string
}

export function toOllamaMessages(system: string, messages: LlmMessage[]): OllamaMessage[] {
  const out: OllamaMessage[] = [{ role: 'system', content: system }]
  for (const m of messages) {
    switch (m.role) {
      case 'user':
        out.push({ role: 'user', content: m.text })
        break
      case 'assistant':
        out.push({
          role: 'assistant',
          content: m.text ?? '',
          ...(m.toolCalls.length > 0
            ? { tool_calls: m.toolCalls.map((c) => ({ function: { name: c.name, arguments: c.args } })) }
            : {}),
        })
        break
      case 'tool':
        // One message per result, named: Ollama has no id to match on.
        for (const r of m.results) out.push({ role: 'tool', tool_name: r.name, content: JSON.stringify(r.result) })
        break
    }
  }
  return out
}

const ChatResponse = z.object({
  message: z.object({
    content: z.string().optional(),
    tool_calls: z.array(z.object({
      function: z.object({ name: z.string(), arguments: z.record(z.string(), z.unknown()).optional() }),
    })).optional(),
  }).optional(),
  prompt_eval_count: z.number().int().optional(),
  eval_count: z.number().int().optional(),
})

export function ollamaLlm(fetchImpl: typeof fetch = fetch): LlmAdapter {
  return {
    provider: 'ollama',
    model: OLLAMA_MODEL,

    async complete(req) {
      const body = JSON.stringify({
        model: OLLAMA_MODEL,
        messages: toOllamaMessages(req.system, req.messages),
        tools: req.tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } })),
        stream: false,
        // Qwen3 and its kin reason before answering unless told not to. On this hardware that
        // costs tens of seconds a turn and routinely spends the whole budget before a tool call
        // ever comes out — the same reason thinking is set to `low` on Gemini (ADR 0006).
        think: false,
        options: { num_predict: req.maxTokens ?? 1024 },
      })

      let res: Response
      try {
        res = await fetchImpl(`${HOST}/api/chat`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body,
          signal: AbortSignal.timeout(TIMEOUT_MS),
        })
      } catch (error) {
        // A refused connection is the usual case: `ollama serve` is not running.
        throw new LlmError('ollama', undefined, error instanceof Error ? error.name : 'unreachable')
      }
      if (!res.ok) throw new LlmError('ollama', res.status, `ollama returned ${res.status}`)

      const parsed = ChatResponse.safeParse(await res.json())
      if (!parsed.success) throw new LlmError('ollama', res.status, 'response is not in the expected shape')

      const message = parsed.data.message
      const toolCalls: ToolCall[] = (message?.tool_calls ?? []).map((c, i) => ({
        id: `${c.function.name}-${i}`,
        name: c.function.name,
        args: c.function.arguments ?? {},
      }))
      const text = message?.content?.trim()
      return {
        text: text ? text : null,
        toolCalls,
        usage: { tokensIn: parsed.data.prompt_eval_count ?? 0, tokensOut: parsed.data.eval_count ?? 0 },
        provider: 'ollama',
        model: OLLAMA_MODEL,
      }
    },
  }
}
