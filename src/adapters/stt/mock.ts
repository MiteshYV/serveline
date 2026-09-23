import type { SttAdapter, SttRequest, SttResult } from './index.ts'

/**
 * Speech to text with no server and no account, so the whole call path runs end to end under
 * `VENDOR_MODE=mock` (CLAUDE.md: no vendor account is required to run the product).
 *
 * The words come from `mockTranscript` on the request — see `SttRequest` for why. Everything else
 * here is real: the seconds are derived from the actual clip, so `call_cost.stt_seconds` moves
 * with the audio and the billing path is exercised rather than stubbed, and the confidence is a
 * number the guardrail can act on.
 *
 * With no `mockTranscript`, this returns the empty string. That is the honest answer for a clip it
 * cannot hear, and it exercises the empty-turn guardrail instead of inventing a dish.
 */

/** Roughly Opus at 16 kB/s, which is what a browser MediaRecorder produces at its defaults. */
const BYTES_PER_SECOND = 16 * 1024

export const mockSttAdapter: SttAdapter = {
  provider: 'mock',
  model: 'mock',

  async transcribe({ audio, mockTranscript }: SttRequest): Promise<SttResult> {
    return {
      text: mockTranscript?.text ?? '',
      // A real recogniser is never certain. 0.95 is what the browser reports on a clean phrase, so
      // a mocked call lands on the same side of Build Spec §5.3's 0.6 gate as a real one. Null
      // when nothing was said: "unknown", not "low".
      confidence: mockTranscript ? (mockTranscript.confidence ?? 0.95) : null,
      seconds: Math.max(Math.ceil(audio.byteLength / BYTES_PER_SECOND), 0),
      provider: 'mock',
      model: 'mock',
    }
  },
}
