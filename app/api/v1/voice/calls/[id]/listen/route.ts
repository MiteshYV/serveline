import { stt, SttError } from '@/adapters/stt/index.ts'
import { addCost } from '@/db/repos/index.ts'
import { sttCostPaise } from '@/voice/pricing.ts'
import { isLang } from '@/ui/lang.ts'
import { authenticate, json, liveCall } from '../../../lib.ts'

export const dynamic = 'force-dynamic'

/**
 * POST /api/v1/voice/calls/{id}/listen — one clip of audio in, one transcript out.
 *
 * The missing half of the call path. `/turn` has always taken text, which meant the caller's voice
 * had to be turned into words somewhere else: on the browser page, by Chrome's own recogniser
 * (ADR 0007). That works on one browser, on a device the caller is holding, and it sends the audio
 * to Google whatever Build Spec §10 says about where this product's data lives. A telephone caller
 * has no browser at all, so the phone half of a voice product had never run.
 *
 * This is the seam the transports meet at. The browser posts a clip it recorded; the Python/Exotel
 * transport will post a clip it cut from the line. Neither knows or cares which recogniser answers
 * — `STT_PROVIDER` decides, and `whisper` runs on the restaurant's own machine.
 *
 * Deliberately not fused with `/turn`. Transcribing and answering are separate failures with
 * separate costs: a clip that could not be heard should be re-recorded, not answered, and the
 * transport is the thing that knows whether re-recording is possible. Build Spec §5.6 shapes the
 * contract this way too.
 *
 * Multipart rather than JSON because the body is audio, and base64 in a JSON string would inflate
 * every clip by a third for nothing.
 */

/** A caller's sentence. Beyond this the transport is sending a recording, not a turn. */
const MAX_BYTES = 8 * 1024 * 1024

/** What a browser MediaRecorder and a telephony leg actually produce. */
const ACCEPTED = ['audio/webm', 'audio/ogg', 'audio/wav', 'audio/x-wav', 'audio/mpeg', 'audio/mp4', 'audio/flac']

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const caller = await authenticate(req)
  if (!caller) return json({ error: 'unauthorised' }, 401)

  const { id } = await params
  const live = await liveCall(id, caller)
  if (live === 404) return json({ error: 'not_found' }, 404)
  if (live === 409) return json({ error: 'ended' }, 409)

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return json({ error: 'bad_request', detail: ['body: not multipart/form-data'] }, 400)
  }

  const file = form.get('audio')
  if (!(file instanceof Blob)) return json({ error: 'bad_request', detail: ['audio: expected a file'] }, 400)
  if (file.size === 0) return json({ error: 'bad_request', detail: ['audio: empty'] }, 400)
  if (file.size > MAX_BYTES) return json({ error: 'too_large' }, 413)

  // A Blob's type can be empty or carry codec parameters ("audio/webm;codecs=opus"); compare the
  // media type alone and fall back to webm, which is what a browser records by default.
  const mimeType = (file.type.split(';')[0] ?? '').trim().toLowerCase() || 'audio/webm'
  if (!ACCEPTED.includes(mimeType)) {
    return json({ error: 'bad_request', detail: [`audio: unsupported type ${mimeType}`] }, 415)
  }

  const asked = form.get('lang')
  const lang = typeof asked === 'string' && isLang(asked) ? asked : live.lang

  const adapter = stt()

  // Mock only, and only when the mock is the selected adapter. Under VENDOR_MODE=mock there is no
  // recogniser, so the browser hands over the words its own one heard and everything downstream —
  // the ledger, the confidence gate, the turn — runs for real. Refused outright against a live
  // recogniser so this can never become a way to put words in a caller's mouth.
  const scripted = form.get('mockTranscript')
  if (typeof scripted === 'string' && adapter.provider !== 'mock') {
    return json({ error: 'bad_request', detail: ['mockTranscript: only with STT_PROVIDER=mock'] }, 400)
  }
  const claimed = Number(form.get('mockConfidence'))
  const mockTranscript = typeof scripted === 'string' && adapter.provider === 'mock'
    ? { text: scripted, ...(Number.isFinite(claimed) && claimed >= 0 && claimed <= 1 ? { confidence: claimed } : {}) }
    : undefined

  let heard
  try {
    heard = await adapter.transcribe({
      audio: new Uint8Array(await file.arrayBuffer()),
      mimeType,
      lang,
      ...(mockTranscript ? { mockTranscript } : {}),
    })
  } catch (error) {
    // Logs the provider and the status, never the audio or anything derived from it (CLAUDE.md).
    const status = error instanceof SttError ? error.status : undefined
    console.error(`stt failed: call=${id} provider=${adapter.provider} status=${status ?? 'network'}`)
    return json({ error: 'stt_failed' }, 502)
  }

  // Billed even when nothing was said: the recogniser ran, the seconds were spent, and a ledger
  // that only counts successful clips under-reports what a call actually cost.
  await addCost(id, {
    llmPaise: 0,
    tokensIn: 0,
    tokensOut: 0,
    sttPaise: sttCostPaise(heard.provider, heard.seconds),
    sttSeconds: heard.seconds,
  }).catch(() => undefined)

  // An empty transcript is a 200 with empty text, not an error: silence is a thing a caller does,
  // and the transport decides whether to prompt again or wait. The turn guardrails already handle
  // an empty utterance.
  return json({ text: heard.text, confidence: heard.confidence, seconds: heard.seconds })
}
