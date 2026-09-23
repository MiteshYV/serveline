import type { Lang } from '../../ui/i18n.ts'
import { vendorMode } from '../mode.ts'
import { mockSttAdapter } from './mock.ts'
import { sarvamStt } from './sarvam.ts'
import { whisperStt } from './whisper.ts'

/**
 * Speech to text — the half of the voice assistant that had never run.
 *
 * Build Spec §3 puts Sarvam here. ADR 0007 measured `whisper.cpp` with `large-v3-turbo` on the
 * restaurant's own machine instead: accurate on English and Hindi, ~1.9 s a clip warm, and no
 * account to buy. It is the substitute for the Sarvam dependency that cannot be bought yet, and
 * it is the strongest available answer to Build Spec §10's data-residency question, because the
 * audio never leaves the building.
 *
 * Until now `/r/{slug}/call` listened through the browser's own `SpeechRecognition`. That is a
 * feature of Chrome, not a feature of the product: it cannot hear a caller on a telephone, it does
 * not exist on every browser, and it sends audio to Google regardless of where the rest of the
 * data lives. Everything measured about this assistant so far — the 90-case eval, ADR 0007's
 * tables — has been text in and text out, because there was no other option.
 *
 * The interface is deliberately transport-shaped: bytes in, text out. The browser posts a clip it
 * recorded; the Python/Exotel transport will post a clip it cut from the phone line. Neither knows
 * which provider answered.
 */

export type SttRequest = {
  /** The clip, exactly as the transport captured it. */
  audio: Uint8Array
  /** What those bytes are — `audio/webm`, `audio/wav`, `audio/ogg`. A provider that needs one format converts. */
  mimeType: string
  /**
   * The language the caller chose. A hint, not a constraint: a caller who switches mid-call is a
   * real thing, and a recogniser told "hi" may still return English words in Latin script.
   */
  lang: Lang
  /**
   * Mock only, and named so nobody mistakes it for anything else.
   *
   * A mock recogniser has an awkward problem: bytes in, words out, and no way to know which words.
   * So under `VENDOR_MODE=mock` the transport — which does have the words, from the browser's own
   * recogniser — says what was said, and the mock returns it. Every other part of the path runs
   * for real: the route, the ledger, the confidence gate, the turn.
   *
   * Real providers ignore this field. `whisper.ts` never reads it, so setting it against a live
   * recogniser changes nothing; it is not a way to put words in a caller's mouth.
   */
  mockTranscript?: { text: string; confidence?: number }
}

export type SttResult = {
  /** What was said. Empty when the clip held no speech — silence is a valid answer, not an error. */
  text: string
  /**
   * 0–1, or null where the provider does not report one.
   *
   * Feeds `call_turn.asr_confidence` and the guardrail that treats anything under 0.6 as
   * low-confidence (Build Spec §5.3). A null means "unknown", and the guardrail must not read
   * unknown as low — a provider that cannot report confidence should not make every turn suspect.
   */
  confidence: number | null
  /** Audio seconds. What speech vendors bill for, so it feeds `call_cost.stt_seconds`. */
  seconds: number
  provider: string
  model: string
}

export interface SttAdapter {
  readonly provider: string
  readonly model: string
  transcribe(req: SttRequest): Promise<SttResult>
}

/**
 * What a real provider throws, shaped like `LlmError` so the call path handles both the same way.
 * Never carries the audio or the transcript: both are the caller's words (CLAUDE.md, no PII in
 * logs). `status` is undefined when the request never got an HTTP answer at all.
 */
export class SttError extends Error {
  readonly provider: string
  readonly status: number | undefined

  constructor(provider: string, status: number | undefined, message: string, options?: ErrorOptions) {
    super(`${provider} ${status ?? 'network'}: ${message}`, options)
    this.name = 'SttError'
    this.provider = provider
    this.status = status
  }
}

type Provider = 'whisper' | 'sarvam' | 'mock' | 'failing'

/**
 * The same test hook `llm()` has: `STT_PROVIDER=failing` selects an adapter that always throws,
 * so the listen path's error handling can be driven without a server or a key. Deliberately absent
 * from .env.example.
 */
export const failingSttAdapter: SttAdapter = {
  provider: 'failing',
  model: 'always-throws',
  transcribe: async () => {
    throw new SttError('failing', 503, 'scripted failure (STT_PROVIDER=failing)')
  },
}

/**
 * `STT_PROVIDER` names the provider (.env.example). A named provider is used whatever VENDOR_MODE
 * says, and a name without what it needs is an error rather than a quiet fall back to the mock
 * (CLAUDE.md). With nothing named, VENDOR_MODE decides: mock → the scripted mock; live → not
 * configured, because a live call that silently transcribes nothing is worse than one that refuses.
 */
export function stt(): SttAdapter {
  const provider = process.env.STT_PROVIDER

  if (!provider) {
    if (vendorMode() === 'mock') return mockSttAdapter
    throw new Error('not configured: STT_PROVIDER')
  }
  if (provider === 'mock') return mockSttAdapter
  if (provider === 'failing') return failingSttAdapter
  // A model on this machine: no key to check, and the host is the only thing that could be wrong.
  if (provider === 'whisper') return whisperStt()

  if (provider === ('sarvam' satisfies Provider)) {
    const key = process.env.SARVAM_API_KEY
    if (!key) throw new Error('not configured: SARVAM_API_KEY')
    return sarvamStt(key)
  }

  throw new Error(`STT_PROVIDER must be "whisper", "sarvam" or "mock", received "${provider}"`)
}
