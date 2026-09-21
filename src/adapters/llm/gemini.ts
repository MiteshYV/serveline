import { z } from 'zod'
import { LlmError, type LlmAdapter, type LlmMessage, type ToolCall } from './index.ts'

/**
 * Gemini over REST with `fetch` (M2 design §"Adapters"). Wire shape checked against
 * https://ai.google.dev/api/generate-content on 20 September 2026:
 *
 *   POST /v1beta/models/{model}:generateContent   header x-goog-api-key
 *   { systemInstruction: { parts: [{ text }] },
 *     contents: [{ role: 'user' | 'model', parts: [{ text } | { functionCall } | { functionResponse }] }],
 *     tools: [{ functionDeclarations: [{ name, description, parameters }] }],
 *     toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
 *     generationConfig: { maxOutputTokens } }
 *   → { candidates: [{ content: { parts } }], usageMetadata: { promptTokenCount, candidatesTokenCount } }
 *   error → { error: { code, message, status } }
 *
 * Gemini gives function calls no id and matches a functionResponse by name, so the ids on our
 * ToolCalls are minted here (name + index) purely for our own bookkeeping.
 */
export const GEMINI_MODEL = 'gemini-2.5-flash'

const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`

const RETRY_DELAY_MS = 500

export type GeminiPart =
  | { text: string }
  | { functionCall: { name: string; args: Record<string, unknown> } }
  | { functionResponse: { name: string; response: Record<string, unknown> } }

export type GeminiContent = { role: 'user' | 'model'; parts: GeminiPart[] }

export function toGeminiContents(messages: LlmMessage[]): GeminiContent[] {
  return messages.map((m): GeminiContent => {
    switch (m.role) {
      case 'user':
        return { role: 'user', parts: [{ text: m.text }] }
      case 'assistant':
        return {
          role: 'model',
          parts: [
            ...(m.text ? [{ text: m.text }] : []),
            ...m.toolCalls.map((c) => ({ functionCall: { name: c.name, args: c.args } })),
          ],
        }
      case 'tool':
        // Tool results go back in a `user` turn; `response` must be an object, hence the wrap.
        return {
          role: 'user',
          parts: m.results.map((r) => ({ functionResponse: { name: r.name, response: { result: r.result } } })),
        }
    }
  })
}

// A floor, not a mirror (unknown keys are dropped). `thought` parts are 2.5's reasoning summaries,
// only present when asked for; they are not the reply.
const ResponsePart = z.object({
  text: z.string().optional(),
  thought: z.boolean().optional(),
  functionCall: z.object({ name: z.string(), args: z.record(z.string(), z.unknown()).optional() }).optional(),
})

const GenerateContentResponse = z.object({
  candidates: z.array(z.object({
    content: z.object({ parts: z.array(ResponsePart).optional() }).optional(),
  })).optional(),
  usageMetadata: z.object({
    promptTokenCount: z.number().int().optional(),
    candidatesTokenCount: z.number().int().optional(),
  }).optional(),
})

export function fromGeminiParts(parts: z.infer<typeof ResponsePart>[]): { text: string | null; toolCalls: ToolCall[] } {
  let text = ''
  const toolCalls: ToolCall[] = []
  for (const part of parts) {
    if (part.functionCall) {
      const { name, args } = part.functionCall
      toolCalls.push({ id: `${name}-${toolCalls.length}`, name, args: args ?? {} })
    } else if (part.text && !part.thought) {
      text += part.text
    }
  }
  return { text: text || null, toolCalls }
}

/** The error's own message, never the body: a validation error may echo the prompt. */
async function errorMessage(res: Response): Promise<string> {
  const Body = z.object({ error: z.object({ message: z.string() }) })
  try {
    const parsed = Body.safeParse(await res.json())
    if (parsed.success) return parsed.data.error.message
  } catch {
    // not JSON
  }
  return res.statusText || 'request failed'
}

/** `fetchImpl` is a seam for tests; production uses the global. */
export function geminiLlm(apiKey: string, fetchImpl: typeof fetch = fetch): LlmAdapter {
  return {
    provider: 'gemini',
    model: GEMINI_MODEL,

    async complete(req) {
      const body = JSON.stringify({
        systemInstruction: { parts: [{ text: req.system }] },
        contents: toGeminiContents(req.messages),
        tools: [{ functionDeclarations: req.tools.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters })) }],
        toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
        generationConfig: { maxOutputTokens: req.maxTokens ?? 1024 },
      })

      // Build Spec §5.3 "outage": the loop counts failures per session, so one quick retry here
      // absorbs a transient 429/5xx without turning it into a strike.
      let res: Response
      for (let attempt = 0; ; attempt++) {
        res = await fetchImpl(ENDPOINT, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
          body,
        })
        if (res.ok) break
        const transient = res.status === 429 || res.status >= 500
        if (transient && attempt === 0) {
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS))
          continue
        }
        throw new LlmError('gemini', res.status, await errorMessage(res))
      }

      const parsed = GenerateContentResponse.safeParse(await res.json())
      if (!parsed.success) throw new LlmError('gemini', res.status, 'response is not in the expected shape')

      const { text, toolCalls } = fromGeminiParts(parsed.data.candidates?.[0]?.content?.parts ?? [])
      return {
        text,
        toolCalls,
        usage: {
          tokensIn: parsed.data.usageMetadata?.promptTokenCount ?? 0,
          tokensOut: parsed.data.usageMetadata?.candidatesTokenCount ?? 0,
        },
        provider: 'gemini',
        model: GEMINI_MODEL,
      }
    },
  }
}
