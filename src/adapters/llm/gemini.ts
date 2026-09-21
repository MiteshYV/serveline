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
/**
 * Build Spec §3 names Gemini 2.5 Flash. It is retired for keys issued after mid-2026 — the API
 * answers "no longer available to new users" — so the model is chosen by measurement instead
 * (ADR 0006), and `GEMINI_MODEL` overrides it without a code change when Google moves again.
 *
 * Measured on this account, 21 September 2026, on a three-dish Hinglish order with one tool:
 * 3.5-flash-lite 1.19 s median (1.57 s worst of five); flash-lite-latest 1.07 s but a 9.8 s
 * outlier; 3-flash-preview 1.82 s; and every full Flash model either 503'd or took 10-40 s.
 * Build Spec §5.4 budgets 1.8 s for a whole turn, so the lite model is the only one that fits.
 */
export const GEMINI_MODEL = process.env.GEMINI_MODEL ?? 'gemini-3.5-flash-lite'

/**
 * Thinking costs seconds a phone call does not have. `low` is the floor this model accepts —
 * `thinkingBudget: 0` is a 400 here — and it still reads a three-dish order correctly.
 */
const THINKING = { thinkingLevel: 'low' } as const

const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`

const RETRY_DELAY_MS = 500

export type GeminiPart =
  | { text: string }
  | { functionCall: { name: string; args: Record<string, unknown> }; thoughtSignature?: string }
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
            // Gemini 3 rejects the next request — 400, "missing a thought_signature in
            // functionCall parts" — unless each call comes back with the signature it was issued
            // with. https://ai.google.dev/gemini-api/docs/thought-signatures, 21 September 2026.
            ...m.toolCalls.map((c) => {
              const signature = typeof c.meta?.thoughtSignature === 'string' ? c.meta.thoughtSignature : undefined
              return { functionCall: { name: c.name, args: c.args }, ...(signature ? { thoughtSignature: signature } : {}) }
            }),
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
  /** Gemini 3: opaque, and required back on the model turn (see toGeminiContents). */
  thoughtSignature: z.string().optional(),
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
      toolCalls.push({
        id: `${name}-${toolCalls.length}`,
        name,
        args: args ?? {},
        ...(part.thoughtSignature ? { meta: { thoughtSignature: part.thoughtSignature } } : {}),
      })
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

/**
 * Gemini's `functionDeclarations.parameters` is an OpenAPI 3.0 subset, not JSON Schema: it rejects
 * the request outright — 400, "Unknown name additionalProperties" — for keywords it does not know.
 * contracts/voice-tools.json stays strict JSON Schema, because Anthropic's `input_schema` and the
 * Python transport both want it; the translation belongs here, in the adapter.
 *
 * Whitelisted rather than blacklisted: an unknown keyword added to the contract later should be
 * dropped quietly, not break every call.
 * https://ai.google.dev/api/caching#Schema, checked 21 September 2026.
 */
const GEMINI_SCHEMA_KEYS = new Set([
  'type', 'format', 'title', 'description', 'nullable', 'enum', 'default', 'example',
  'items', 'minItems', 'maxItems', 'properties', 'required', 'minProperties', 'maxProperties',
  'minLength', 'maxLength', 'pattern', 'minimum', 'maximum', 'anyOf', 'propertyOrdering',
])

export function toGeminiSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(toGeminiSchema)
  if (typeof schema !== 'object' || schema === null) return schema
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(schema)) {
    if (!GEMINI_SCHEMA_KEYS.has(key)) continue
    // `properties` is a map of names to schemas: its keys are field names, not keywords.
    out[key] = key === 'properties' && typeof value === 'object' && value !== null && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).map(([name, sub]) => [name, toGeminiSchema(sub)]))
      : toGeminiSchema(value)
  }
  return out
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
        tools: [{ functionDeclarations: req.tools.map((t) => ({ name: t.name, description: t.description, parameters: toGeminiSchema(t.parameters) })) }],
        toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
        generationConfig: { maxOutputTokens: req.maxTokens ?? 1024, thinkingConfig: THINKING },
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
