import type { Lang } from '../../ui/i18n.ts'
import { SttError, type SttAdapter, type SttRequest, type SttResult } from './index.ts'

/**
 * Sarvam's speech-to-text, which Build Spec §3 names as the vendor for Indic audio.
 *
 * Written against their documented API and **never run** — there is no account to run it with
 * (ADR 0007: "Sarvam cannot be bought yet"). It is here so that turning Sarvam on is an
 * environment variable rather than a change to calling code, which is the promise CLAUDE.md makes
 * about every adapter. Treat the request shape below as unverified until the first real call, and
 * check it against their docs before trusting it: a vendor's API is not a thing to take on faith
 * from a file that has never received a 200.
 *
 * Whisper (ADR 0007) is the working local alternative and is what `STT_PROVIDER=whisper` selects.
 * The case for Sarvam is Kannada and telephone-band audio, where a model trained on Indian speech
 * should beat a general one — but that is an expectation, not a measurement, and the eval set
 * exists to settle it the day an account appears.
 */

const ENDPOINT = 'https://api.sarvam.ai/speech-to-text'
const TIMEOUT_MS = 30_000

/** `SARVAM_MODEL` records a different one in the ledger without a code change. */
const MODEL = process.env.SARVAM_MODEL ?? 'saarika:v2'

/** Sarvam takes BCP-47 with a region, the same tags the browser recogniser uses. */
const TAGS: Record<Lang, string> = { hi: 'hi-IN', en: 'en-IN', kn: 'kn-IN' }

type SarvamResponse = {
  transcript?: string
  language_code?: string
  error?: string | { message?: string }
}

export function sarvamStt(apiKey: string): SttAdapter {
  return {
    provider: 'sarvam',
    model: MODEL,

    async transcribe({ audio, mimeType, lang }: SttRequest): Promise<SttResult> {
      const form = new FormData()
      form.append('file', new Blob([audio as BlobPart], { type: mimeType }), 'clip')
      form.append('model', MODEL)
      form.append('language_code', TAGS[lang])

      let response: Response
      try {
        response = await fetch(ENDPOINT, {
          method: 'POST',
          headers: { 'api-subscription-key': apiKey },
          body: form,
          signal: AbortSignal.timeout(TIMEOUT_MS),
        })
      } catch (cause) {
        throw new SttError('sarvam', undefined, 'request failed', { cause })
      }

      if (!response.ok) {
        // Never echoes the body wholesale: a vendor error can quote the request, and the request
        // is the caller's voice (CLAUDE.md, no PII in logs).
        throw new SttError('sarvam', response.status, response.status === 401 ? 'rejected the key' : 'error response')
      }

      let body: SarvamResponse
      try {
        body = (await response.json()) as SarvamResponse
      } catch (cause) {
        throw new SttError('sarvam', response.status, 'response was not JSON', { cause })
      }
      if (body.error) {
        throw new SttError('sarvam', response.status, typeof body.error === 'string' ? body.error : (body.error.message ?? 'error'))
      }

      return {
        text: (body.transcript ?? '').trim(),
        // Sarvam's documented response carries no per-utterance confidence. Null is "unknown",
        // and Build Spec §5.3's gate must not read unknown as low — see SttResult.
        confidence: null,
        // Nor a duration. Left at zero rather than guessed: an invented number in call_cost is
        // worse than a missing one, because §12's spend alert is computed from it.
        seconds: 0,
        provider: 'sarvam',
        model: MODEL,
      }
    },
  }
}
