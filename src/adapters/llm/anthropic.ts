import Anthropic from '@anthropic-ai/sdk'
import { LlmError, type LlmAdapter, type LlmMessage, type ToolCall } from './index.ts'

/**
 * Anthropic over the official SDK (M2 design §"Adapters"): Claude Haiku 4.5, the Build Spec's
 * second provider. Haiku 4.5 takes no `thinking` parameter, so none is sent. The SDK's own
 * types are used for everything on the wire; only our provider-neutral messages are mapped.
 */
export const ANTHROPIC_MODEL = 'claude-haiku-4-5'

export function toAnthropicMessages(messages: LlmMessage[]): Anthropic.MessageParam[] {
  return messages.map((m): Anthropic.MessageParam => {
    switch (m.role) {
      case 'user':
        return { role: 'user', content: m.text }
      case 'assistant': {
        const content: Anthropic.ContentBlockParam[] = []
        if (m.text) content.push({ type: 'text', text: m.text })
        for (const c of m.toolCalls) content.push({ type: 'tool_use', id: c.id, name: c.name, input: c.args })
        return { role: 'assistant', content }
      }
      case 'tool':
        // All of a round's results in one user message: splitting them teaches the model to
        // stop calling tools in parallel.
        return {
          role: 'user',
          content: m.results.map((r): Anthropic.ToolResultBlockParam => ({
            type: 'tool_result',
            tool_use_id: r.id,
            content: JSON.stringify(r.result),
          })),
        }
    }
  })
}

// Response blocks and request params share the two shapes read here (text; tool_use id/name/input),
// so one reader serves the round-trip test as well as the live response.
export function fromAnthropicContent(
  content: ReadonlyArray<Anthropic.ContentBlock | Anthropic.ContentBlockParam>,
): { text: string | null; toolCalls: ToolCall[] } {
  let text = ''
  const toolCalls: ToolCall[] = []
  for (const block of content) {
    if (block.type === 'text') {
      text += block.text
    } else if (block.type === 'tool_use') {
      const input = block.input
      const args = typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {}
      toolCalls.push({ id: block.id, name: block.name, args })
    }
  }
  return { text: text || null, toolCalls }
}

export function anthropicLlm(apiKey: string): LlmAdapter {
  // One retry on 429/5xx/connection errors — the same budget gemini.ts gives itself, so a
  // Build Spec §5.3 "outage" strike means the same thing on either provider.
  const client = new Anthropic({ apiKey, maxRetries: 1 })

  return {
    provider: 'anthropic',
    model: ANTHROPIC_MODEL,

    async complete(req) {
      let res: Anthropic.Message
      try {
        res = await client.messages.create({
          model: ANTHROPIC_MODEL,
          max_tokens: req.maxTokens ?? 1024,
          system: req.system,
          tools: req.tools.map((t): Anthropic.Tool => ({
            name: t.name,
            description: t.description,
            input_schema: { ...t.parameters, type: 'object' },
          })),
          messages: toAnthropicMessages(req.messages),
        })
      } catch (err) {
        // Most specific first. A rejected key is the case acceptance criterion 6 rehearses, and
        // the message says where to look without quoting anything from the request.
        if (err instanceof Anthropic.AuthenticationError) {
          throw new LlmError('anthropic', err.status, 'API key rejected; check LLM_*_API_KEY', { cause: err })
        }
        if (err instanceof Anthropic.APIError) {
          throw new LlmError('anthropic', err.status, err.message, { cause: err })
        }
        throw err
      }

      const { text, toolCalls } = fromAnthropicContent(res.content)
      return {
        text,
        toolCalls,
        usage: { tokensIn: res.usage.input_tokens, tokensOut: res.usage.output_tokens },
        provider: 'anthropic',
        model: res.model,
      }
    },
  }
}
