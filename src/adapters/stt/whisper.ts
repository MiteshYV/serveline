import type { Lang } from '../../ui/i18n.ts'
import { SttError, type SttAdapter, type SttRequest, type SttResult } from './index.ts'

/**
 * `whisper.cpp` running as a persistent server on the restaurant's own machine (ADR 0007).
 *
 * Measured there on 22 September 2026 with `large-v3-turbo` (q5_0, 547 MB): exact on a 3 s English
 * clip, correct but for one vowel on Hindi, ~1.9 s warm. Cold start is 22 s of model load, which is
 * why this expects a server that stays up rather than a process per clip:
 *
 *   whisper-server -m models/ggml-large-v3-turbo-q5_0.bin --host 127.0.0.1 --port 8080
 *
 * `WHISPER_HOST` overrides the address. There is no key: the audio never leaves the machine, which
 * is the point — Build Spec §10 wants customer data in Mumbai, and a restaurant's own counter is
 * inside that promise in a way an American speech API is not.
 */

const DEFAULT_HOST = 'http://127.0.0.1:8080'

/** A clip is a caller's sentence, not a monologue; past this something is wrong with the transport. */
const TIMEOUT_MS = 30_000

/** ADR 0007's model. `WHISPER_MODEL` records a different one in the ledger without a code change. */
const MODEL = process.env.WHISPER_MODEL ?? 'large-v3-turbo'

type Segment = {
  /** whisper.cpp emits these as seconds in verbose_json. */
  start?: number
  end?: number
  /** Mean log probability per token over the segment. Negative; closer to 0 is more certain. */
  avg_logprob?: number
  /** How confident the model is that the segment is silence. */
  no_speech_prob?: number
}

type WhisperResponse = {
  text?: string
  segments?: Segment[]
  duration?: number
  error?: string
}

/**
 * whisper.cpp reports a mean log probability per token, not a confidence. `exp(avg_logprob)` turns
 * it back into a per-token probability, which is the closest honest reading available — it is a
 * proxy for "how sure was the model of the words it chose", not a calibrated probability that the
 * transcript is right.
 *
 * Weighted by segment duration so a long confident sentence is not dragged down by a short
 * uncertain one, and reduced by `no_speech_prob` so a segment the model half-thinks is silence
 * cannot report high confidence. Build Spec §5.3 gates on 0.6; this is the number that gate sees.
 */
function deriveConfidence(segments: Segment[]): number | null {
  const usable = segments.filter((s) => typeof s.avg_logprob === 'number')
  if (usable.length === 0) return null

  let weighted = 0
  let total = 0
  for (const s of usable) {
    const span = Math.max((s.end ?? 0) - (s.start ?? 0), 0.01)
    const speech = 1 - Math.min(Math.max(s.no_speech_prob ?? 0, 0), 1)
    weighted += Math.exp(s.avg_logprob!) * speech * span
    total += span
  }
  if (total === 0) return null
  return Math.min(Math.max(weighted / total, 0), 1)
}

/** Last segment end, falling back to the reported duration, then to nothing. Whole seconds: the ledger is an integer. */
function durationSeconds(body: WhisperResponse): number {
  const last = body.segments?.at(-1)?.end
  const seconds = typeof last === 'number' ? last : typeof body.duration === 'number' ? body.duration : 0
  return Math.max(Math.ceil(seconds), 0)
}

/** whisper.cpp takes ISO-639-1, which is what `Lang` already is; `auto` would cost a detection pass. */
const languageOf = (lang: Lang): string => lang

export function whisperStt(): SttAdapter {
  const host = (process.env.WHISPER_HOST ?? DEFAULT_HOST).replace(/\/$/, '')

  return {
    provider: 'whisper',
    model: MODEL,

    async transcribe({ audio, mimeType, lang }: SttRequest): Promise<SttResult> {
      const form = new FormData()
      // The field name whisper.cpp's /inference expects. The filename is only a hint to its
      // decoder; the bytes and the content type are what matter.
      form.append('file', new Blob([audio as BlobPart], { type: mimeType }), 'clip')
      form.append('response_format', 'verbose_json')
      form.append('language', languageOf(lang))
      // Greedy. A caller's order is not a creative writing task, and sampling costs determinism
      // the eval depends on.
      form.append('temperature', '0.0')

      let response: Response
      try {
        response = await fetch(`${host}/inference`, {
          method: 'POST',
          body: form,
          signal: AbortSignal.timeout(TIMEOUT_MS),
        })
      } catch (cause) {
        // The usual cause is that nobody started the server. Say so, because "fetch failed" sends
        // the next person looking at the network rather than at their own machine.
        throw new SttError('whisper', undefined, `no whisper-server at ${host} (set WHISPER_HOST, or start one — see docs/adr/0007)`, { cause })
      }

      if (!response.ok) {
        throw new SttError('whisper', response.status, await response.text().catch(() => 'no body'))
      }

      let body: WhisperResponse
      try {
        body = (await response.json()) as WhisperResponse
      } catch (cause) {
        throw new SttError('whisper', response.status, 'response was not JSON', { cause })
      }
      if (body.error) throw new SttError('whisper', response.status, body.error)

      const segments = body.segments ?? []
      return {
        // whisper pads its output with a leading space, and returns "[BLANK_AUDIO]" or "(silence)"
        // for a clip with nothing in it — all three of which should read as "said nothing".
        text: cleanTranscript(body.text ?? ''),
        confidence: deriveConfidence(segments),
        seconds: durationSeconds(body),
        provider: 'whisper',
        model: MODEL,
      }
    },
  }
}

/**
 * whisper.cpp annotates non-speech rather than returning nothing: a clip of a kitchen produces
 * `[BLANK_AUDIO]`, `(silence)` or `[MUSIC]`. Those are the model describing the audio, not the
 * caller speaking, and the guardrail for an empty turn already exists — so they become the empty
 * string rather than being sent to the assistant as if a caller had said them.
 */
export function cleanTranscript(raw: string): string {
  const stripped = raw
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\((?:silence|blank_audio|music|laughter|inaudible)\)/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return stripped
}
