'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Band } from '@/ui/Band.tsx'
import { Button } from '@/ui/Button.tsx'
import { Field } from '@/ui/Field.tsx'
import fieldStyles from '@/ui/Field.module.css'
import type { Lang } from '@/ui/i18n.ts'
import { LANG_NAMES } from '@/ui/lang.ts'
import type { TurnResult } from '@/voice/loop.ts'
import styles from './call.module.css'

/**
 * The browser transport of the call assistant (M2 design "Surfaces", ADR 0004): the reply spoken
 * with `speechSynthesis` in the caller's language and shown as a transcript. Feature-detected at
 * every level — the field below is the only input that is always there, in every state.
 *
 * There are two ways this page turns a voice into words, and it picks the better one it can run:
 *
 *  - **clip** — `MediaRecorder` records what the caller said and posts it to `/listen`, which
 *    hands it to whichever recogniser `STT_PROVIDER` selected (ADR 0007: `whisper.cpp` on the
 *    restaurant's own machine). The audio goes to the restaurant, not to Google, and the same
 *    route is what the Exotel transport will post a telephone clip to.
 *  - **browser** — the page's own `SpeechRecognition`, which is what this file did before
 *    `/listen` existed. Chrome only, a held device only, and the audio goes to Google whatever
 *    Build Spec §10 says. Kept because it is still better than nothing when the clip path cannot
 *    run here, and because under the mock it is the only thing that knows what was said.
 *
 * Under the mock there is no recogniser at all, so the clip path runs *with* the browser one
 * beside it: the recogniser supplies the words in `mockTranscript` and everything else on the
 * route — the ledger, the confidence gate, the turn — runs for real with no server to start. It
 * is never started beside a live recogniser; that would put the audio back on the wire that
 * ADR 0007 took it off.
 *
 * One component, no dependency, no polyfill, no webfont: MediaRecorder and getUserMedia are
 * platform APIs, so the ordering page's budget (ADR 0003, which covers this route) is untouched.
 */

type Props = {
  slug: string
  restaurant: string
  lang: Lang
  /**
   * Whether `/listen` will answer with the mock recogniser — decided server-side in page.tsx,
   * because `stt()` reads the environment and a client component cannot. True means this page
   * must hand over the words its own recogniser heard, since a mock cannot invent them.
   */
  mockStt: boolean
}

/** What the recogniser and the voices are asked for (M2 design "Surfaces": hi-IN, en-IN, kn-IN). */
const BCP47: Record<Lang, string> = { hi: 'hi-IN', en: 'en-IN', kn: 'kn-IN' }

/** Design "Guardrails", silence: after "Are you there?" the call ends 30 s later without speech. */
const SILENCE_MS = 30_000
/** Build Spec §5.4: a turn longer than this gets a spoken filler, once. A turn is two to four
 *  model calls, so on the measured numbers (docs/adr/0006) most turns cross it. */
const FILLER_AFTER_MS = 1_200

/**
 * Empty recogniser runs in a row before the prompt (design: "twice"), and the last run the page
 * starts on its own — after it, only a tap or a keystroke listens again, so a tab that cannot
 * capture audio does not spin until the timer ends the call.
 */
const PROMPT_AFTER_EMPTY = 2
const LAST_AUTO_LISTEN = 3

/**
 * A clip is a caller's sentence. The route refuses 8 MB, which a browser needs minutes to reach,
 * so this is not about the limit: it is the backstop for a recording nobody stopped — a tab left
 * open, or a mock run where the recogniser never reported an end. The caller's own tap is the
 * normal way a clip ends.
 */
const MAX_CLIP_MS = 15_000

/**
 * After asking the recogniser beside the recorder to stop, how long its last result is waited
 * for before the clip is ended anyway. A backstop for one that never answers; in practice
 * `onend` arrives well inside it and ends the clip itself.
 */
const RECOGNISER_FLUSH_MS = 1_000

/**
 * Consecutive clip failures before the page stops trying. One is a bad moment; two in a row is a
 * recogniser that is not there (ADR 0007's whisper server is a process someone has to have
 * started), and asking the caller to keep talking into it is worse than saying so.
 */
const CLIP_FAILURES_BEFORE_FALLBACK = 2

/** In the route's accepted list, commonest first. Chrome records webm/opus, Safari mp4/aac. */
const CLIP_TYPES = ['audio/webm', 'audio/mp4', 'audio/ogg']

const JSON_HEADERS = { 'content-type': 'application/json' }

/**
 * What this browser can record, or undefined to let it choose — the route accepts either, and a
 * type it does not accept comes back 415, which is handled.
 */
function clipType(): string | undefined {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') return undefined
  return CLIP_TYPES.find((type) => MediaRecorder.isTypeSupported(type))
}

const canRecord = (): boolean =>
  typeof MediaRecorder !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function'

/**
 * The Web Speech recogniser: TS 5.9's DOM lib types its result lists but not the object, and
 * Safari still exposes it under the webkit prefix. Only the members used here.
 */
type Recogniser = {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  onresult: ((e: { results: SpeechRecognitionResultList }) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  start(): void
  /** Ends the run and delivers what it has heard so far, then `onend`. */
  stop(): void
  /** Ends the run and throws it away — no result, then `onend`. */
  abort(): void
}
type RecogniserCtor = new () => Recogniser

const recogniserCtor = (): RecogniserCtor | null => {
  const w = window as unknown as { SpeechRecognition?: RecogniserCtor; webkitSpeechRecognition?: RecogniserCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

const synth = (): SpeechSynthesis | null => ('speechSynthesis' in window ? window.speechSynthesis : null)

/** Exact tag first (hi-IN), then any voice of the language (an en-GB voice still reads English). */
function pickVoice(voices: SpeechSynthesisVoice[], lang: Lang): SpeechSynthesisVoice | undefined {
  const want = BCP47[lang].toLowerCase()
  const tagOf = (v: SpeechSynthesisVoice) => v.lang.replace('_', '-').toLowerCase()
  return voices.find((v) => tagOf(v) === want) ?? voices.find((v) => tagOf(v).startsWith(lang))
}

type Strings = {
  call: string
  limit: string
  connecting: string
  listening: string
  recording: string
  thinking: string
  speaking: string
  tapToSpeak: string
  tapToStop: string
  typeInstead: string
  send: string
  endCall: string
  areYouThere: string
  noVoice: string
  micDenied: string
  noMic: string
  noRecognition: string
  startFailed: string
  sendFailed: string
  listenFailed: string
  clipTooLong: string
  ended: string
  orderPlaced: string
  handedOff: string
  failed: string
  viewOrder: string
  backToMenu: string
  you: string
}

// ponytail: the page's own strings, not src/ui/i18n.ts — that dictionary is one object for all
// three surfaces and any client import of t() ships the whole of it (its own note says so); this
// route has ~25 strings and the ordering page's 100 KB budget. Hindi and Kannada are interim, not
// native-reviewed, the same caveat as i18n.ts and loop.ts. Move them when a translator reviews.
const STRINGS: Record<Lang, Strings> = {
  en: {
    call: 'Call {restaurant}',
    limit: 'Voices depend on your device; a Kannada voice is often missing. Typing always works.',
    connecting: 'Connecting…',
    listening: 'Listening…',
    recording: 'Recording…',
    thinking: 'One moment…',
    speaking: 'Speaking…',
    tapToSpeak: 'Tap to speak',
    tapToStop: 'Tap when you have finished',
    typeInstead: 'Type instead',
    send: 'Send',
    endCall: 'End call',
    areYouThere: 'Are you there?',
    noVoice: 'No {language} voice on this device — text still works',
    micDenied: 'Microphone not allowed — text still works',
    noMic: 'No microphone on this device — text still works',
    noRecognition: 'This browser cannot listen — type instead',
    startFailed: 'Could not start the call. Try again.',
    sendFailed: 'That did not reach the restaurant. Try again.',
    listenFailed: 'That could not be heard. Try again, or type it below.',
    clipTooLong: 'That was too long to hear. Say it in a shorter sentence, or type it below.',
    ended: 'Call ended',
    orderPlaced: 'Your order is placed.',
    handedOff: 'The restaurant will take it from here.',
    failed: 'Something went wrong on our side. Please call the restaurant.',
    viewOrder: 'View your order',
    backToMenu: 'Back to the menu',
    you: 'You',
  },
  hi: {
    call: '{restaurant} को कॉल करें',
    limit: 'आवाज़ें आपके डिवाइस पर निर्भर हैं; कन्नड़ आवाज़ अक्सर नहीं होती। टाइप करना हमेशा काम करता है।',
    connecting: 'जोड़ रहे हैं…',
    listening: 'सुन रहे हैं…',
    recording: 'रिकॉर्ड हो रहा है…',
    thinking: 'एक सेकंड…',
    speaking: 'बोल रहे हैं…',
    tapToSpeak: 'बोलने के लिए टैप करें',
    tapToStop: 'बोलना पूरा होने पर टैप करें',
    typeInstead: 'इसके बजाय टाइप करें',
    send: 'भेजें',
    endCall: 'कॉल समाप्त करें',
    areYouThere: 'क्या आप वहाँ हैं?',
    noVoice: 'इस डिवाइस पर {language} आवाज़ नहीं है — टेक्स्ट फिर भी काम करता है',
    micDenied: 'माइक्रोफ़ोन की अनुमति नहीं है — टेक्स्ट फिर भी काम करता है',
    noMic: 'इस डिवाइस पर माइक्रोफ़ोन नहीं है — टेक्स्ट फिर भी काम करता है',
    noRecognition: 'यह ब्राउज़र सुन नहीं सकता — टाइप करें',
    startFailed: 'कॉल शुरू नहीं हो सकी। फिर कोशिश करें।',
    sendFailed: 'यह रेस्टोरेंट तक नहीं पहुँचा। फिर कोशिश करें।',
    listenFailed: 'यह सुना नहीं जा सका। फिर कोशिश करें, या नीचे टाइप करें।',
    clipTooLong: 'यह सुनने के लिए बहुत लंबा था। छोटे वाक्य में कहें, या नीचे टाइप करें।',
    ended: 'कॉल समाप्त',
    orderPlaced: 'आपका ऑर्डर हो गया है।',
    handedOff: 'अब रेस्टोरेंट आगे संभालेगा।',
    failed: 'हमारी तरफ़ से कुछ गड़बड़ हुई। कृपया रेस्टोरेंट को कॉल करें।',
    viewOrder: 'अपना ऑर्डर देखें',
    backToMenu: 'मेन्यू पर वापस',
    you: 'आप',
  },
  kn: {
    call: '{restaurant} ಗೆ ಕರೆ ಮಾಡಿ',
    limit: 'ಧ್ವನಿಗಳು ನಿಮ್ಮ ಸಾಧನವನ್ನು ಅವಲಂಬಿಸಿವೆ; ಕನ್ನಡ ಧ್ವನಿ ಹೆಚ್ಚಾಗಿ ಇರುವುದಿಲ್ಲ. ಟೈಪ್ ಮಾಡುವುದು ಯಾವಾಗಲೂ ಕೆಲಸ ಮಾಡುತ್ತದೆ.',
    connecting: 'ಸಂಪರ್ಕಿಸಲಾಗುತ್ತಿದೆ…',
    listening: 'ಕೇಳುತ್ತಿದ್ದೇವೆ…',
    recording: 'ರೆಕಾರ್ಡ್ ಆಗುತ್ತಿದೆ…',
    thinking: 'ಒಂದು ಕ್ಷಣ…',
    speaking: 'ಮಾತನಾಡುತ್ತಿದ್ದೇವೆ…',
    tapToSpeak: 'ಮಾತನಾಡಲು ಟ್ಯಾಪ್ ಮಾಡಿ',
    tapToStop: 'ಮಾತು ಮುಗಿದ ಮೇಲೆ ಟ್ಯಾಪ್ ಮಾಡಿ',
    typeInstead: 'ಬದಲಿಗೆ ಟೈಪ್ ಮಾಡಿ',
    send: 'ಕಳುಹಿಸಿ',
    endCall: 'ಕರೆ ಮುಗಿಸಿ',
    areYouThere: 'ನೀವು ಇದ್ದೀರಾ?',
    noVoice: 'ಈ ಸಾಧನದಲ್ಲಿ {language} ಧ್ವನಿ ಇಲ್ಲ — ಪಠ್ಯ ಇನ್ನೂ ಕೆಲಸ ಮಾಡುತ್ತದೆ',
    micDenied: 'ಮೈಕ್ರೊಫೋನ್‌ಗೆ ಅನುಮತಿ ಇಲ್ಲ — ಪಠ್ಯ ಇನ್ನೂ ಕೆಲಸ ಮಾಡುತ್ತದೆ',
    noMic: 'ಈ ಸಾಧನದಲ್ಲಿ ಮೈಕ್ರೊಫೋನ್ ಇಲ್ಲ — ಪಠ್ಯ ಇನ್ನೂ ಕೆಲಸ ಮಾಡುತ್ತದೆ',
    noRecognition: 'ಈ ಬ್ರೌಸರ್ ಕೇಳಲು ಸಾಧ್ಯವಿಲ್ಲ — ಟೈಪ್ ಮಾಡಿ',
    startFailed: 'ಕರೆ ಪ್ರಾರಂಭಿಸಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.',
    sendFailed: 'ಇದು ರೆಸ್ಟೋರೆಂಟ್ ತಲುಪಲಿಲ್ಲ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.',
    listenFailed: 'ಅದು ಕೇಳಿಸಲಿಲ್ಲ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ, ಅಥವಾ ಕೆಳಗೆ ಟೈಪ್ ಮಾಡಿ.',
    clipTooLong: 'ಅದು ಕೇಳಲು ತುಂಬಾ ಉದ್ದವಾಗಿತ್ತು. ಚಿಕ್ಕ ವಾಕ್ಯದಲ್ಲಿ ಹೇಳಿ, ಅಥವಾ ಕೆಳಗೆ ಟೈಪ್ ಮಾಡಿ.',
    ended: 'ಕರೆ ಮುಗಿದಿದೆ',
    orderPlaced: 'ನಿಮ್ಮ ಆರ್ಡರ್ ಆಗಿದೆ.',
    handedOff: 'ಇನ್ನು ರೆಸ್ಟೋರೆಂಟ್ ಮುಂದುವರಿಸುತ್ತದೆ.',
    failed: 'ನಮ್ಮ ಕಡೆಯಿಂದ ಏನೋ ತಪ್ಪಾಗಿದೆ. ದಯವಿಟ್ಟು ರೆಸ್ಟೋರೆಂಟ್‌ಗೆ ಕರೆ ಮಾಡಿ.',
    viewOrder: 'ನಿಮ್ಮ ಆರ್ಡರ್ ನೋಡಿ',
    backToMenu: 'ಮೆನುಗೆ ಹಿಂತಿರುಗಿ',
    you: 'ನೀವು',
  },
}

type Line = { id: number; speaker: 'customer' | 'ai'; text: string; lang: Lang }
type Phase = 'idle' | 'connecting' | 'live' | 'ended'
type Activity = 'listening' | 'recording' | 'thinking' | 'speaking' | null
type Ended = { outcome?: TurnResult['outcome']; orderId?: string }
/** Which of the two paths in this file's header is turning the caller's voice into words. */
type Ear = 'clip' | 'browser'
/** What the browser's own recogniser heard, when it was running. */
type Heard = { text: string; confidence: number | undefined }

export function CallClient({ slug, restaurant, lang, mockStt }: Props) {
  const s = STRINGS[lang]
  const [phase, setPhase] = useState<Phase>('idle')
  const [activity, setActivity] = useState<Activity>(null)
  const [lines, setLines] = useState<Line[]>([])
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<'start' | 'send' | 'listen' | 'tooLong' | null>(null)
  const [ended, setEnded] = useState<Ended>({})
  const [text, setText] = useState('')
  const [canListen, setCanListen] = useState(false)

  /** Set while the call is live; null once ended, which is what every async continuation checks. */
  const callId = useRef<string | null>(null)
  const recogniser = useRef<Recogniser | null>(null)
  const micOk = useRef(true)
  const voices = useRef<SpeechSynthesisVoice[]>([])
  // Chrome drops an utterance's onend if nothing references it; the ref keeps it alive.
  const utterance = useRef<SpeechSynthesisUtterance | null>(null)
  const emptyRuns = useRef(0)
  const silenceTimer = useRef<number | null>(null)
  const nextId = useRef(1)
  const list = useRef<HTMLOListElement>(null)

  /**
   * A ref, not state: every caller of `listen()` is inside a `speak()` continuation or a timer,
   * and a state value captured there is the one from the render that scheduled it. `canListen`
   * is the same fact for rendering only, which is how `micOk` already works.
   */
  const ear = useRef<Ear | null>(null)
  /** Held for the length of the call so a second clip does not re-prompt; released by `finish`. */
  const stream = useRef<MediaStream | null>(null)
  const recorder = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])
  /** The words the browser recogniser heard beside the current clip, under the mock. */
  const heard = useRef<Heard | null>(null)
  const clipTimer = useRef<number | null>(null)
  const clipFails = useRef(0)
  /** True between asking for the microphone and having a recorder, which is a tappable window. */
  const arming = useRef(false)

  useEffect(() => {
    // Feature detection after mount: the server rendered the text-only page and hydration must
    // match it. The voice list arrives asynchronously in Chrome, hence the listener.
    //
    // The clip path is preferred wherever it can run. Under the mock it needs the browser
    // recogniser beside it for the words, so without one it is no better than silence and the
    // browser path is chosen instead — which, without a recogniser either, is no path at all.
    const hasRecogniser = recogniserCtor() !== null
    ear.current = canRecord() && (!mockStt || hasRecogniser) ? 'clip' : hasRecogniser ? 'browser' : null
    if (ear.current) setCanListen(true)
    else setNote(STRINGS[lang].noRecognition)
    const sy = synth()
    const load = () => {
      if (sy) voices.current = sy.getVoices()
    }
    load()
    sy?.addEventListener('voiceschanged', load)
    // The browser hung up (a closed tab, a back navigation): tell the loop, as the end route
    // expects, so the call row does not stay open. keepalive lets the request outlive the page.
    const bye = () => {
      const id = callId.current
      if (!id) return
      fetch(`/api/v1/voice/calls/${id}/end`, {
        method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ reason: 'pagehide' }), keepalive: true,
      }).catch(() => undefined)
    }
    window.addEventListener('pagehide', bye)
    return () => {
      sy?.removeEventListener('voiceschanged', load)
      window.removeEventListener('pagehide', bye)
      recogniser.current?.abort()
      // Detached first: an unmounted page must not go on to post the clip it was holding. The
      // tracks are stopped explicitly or the browser's recording indicator stays lit.
      const rec = recorder.current
      if (rec) {
        rec.ondataavailable = null
        rec.onstop = null
        if (rec.state !== 'inactive') rec.stop()
        recorder.current = null
      }
      stream.current?.getTracks().forEach((track) => track.stop())
      stream.current = null
      if (silenceTimer.current !== null) clearTimeout(silenceTimer.current)
      if (clipTimer.current !== null) clearTimeout(clipTimer.current)
      sy?.cancel()
    }
  }, [lang, mockStt])

  useEffect(() => {
    const el = list.current
    if (el) el.scrollTop = el.scrollHeight
  }, [lines])

  function append(speaker: Line['speaker'], line: string, inLang: Lang = lang) {
    setLines((prev) => [...prev, { id: nextId.current++, speaker, text: line, lang: inLang }])
  }

  function clearSilence() {
    if (silenceTimer.current !== null) clearTimeout(silenceTimer.current)
    silenceTimer.current = null
  }

  /**
   * Detaches before aborting, so the run's onend never counts as a silence, and throws away a
   * clip in flight — whoever stopped the page listening has already decided what comes instead.
   */
  function stopListening() {
    cancelRecording()
    const r = recogniser.current
    if (!r) return
    r.onend = null
    r.onresult = null
    r.abort()
    recogniser.current = null
    setActivity((a) => (a === 'listening' ? null : a))
  }

  /** Gives the microphone back. The browser's recording indicator is a promise to the caller. */
  function releaseMic() {
    stream.current?.getTracks().forEach((track) => track.stop())
    stream.current = null
  }

  /**
   * The clip path cannot run here. Falls back to the browser's own recogniser if there is one —
   * worse on every count ADR 0007 lists, and still better than a caller mid-order with no voice
   * at all — and otherwise to the field below, which has never stopped working.
   */
  function fallBack() {
    ear.current = recogniserCtor() ? 'browser' : null
    setCanListen(ear.current !== null)
  }

  /**
   * Stops the voice without its continuation. Chrome reports a cancelled utterance as `onend`,
   * the same as one that finished, so the handlers come off first: whoever hushes it — a
   * barge-in, a typed message, the end of the call — has already decided what happens next.
   */
  function hush() {
    const u = utterance.current
    if (u) {
      u.onend = null
      u.onerror = null
      utterance.current = null
    }
    synth()?.cancel()
  }

  /** Speaks a line and calls `then` once it has been heard (or could not be spoken at all). */
  function speak(line: string, inLang: Lang, then: () => void) {
    const sy = synth()
    if (!sy || typeof SpeechSynthesisUtterance === 'undefined') {
      then()
      return
    }
    hush()
    const u = new SpeechSynthesisUtterance(line)
    u.lang = BCP47[inLang]
    const voice = pickVoice(voices.current, inLang)
    if (voice) u.voice = voice
    // An empty list means the browser has not reported its voices yet, not that it has none.
    else if (voices.current.length > 0) setNote(s.noVoice.replace('{language}', LANG_NAMES[inLang]))
    let done = false
    const finish = () => {
      if (done) return
      done = true
      utterance.current = null
      then()
    }
    u.onend = finish
    u.onerror = finish
    utterance.current = u
    setActivity('speaking')
    sy.speak(u)
  }

  /**
   * Barge-in (design "Surfaces": speaking stops the voice): starting to listen cancels speech.
   * Which way it listens is `ear` — see this file's header for the two.
   */
  function listen() {
    if (ear.current === 'clip') void record()
    else if (ear.current === 'browser') listenBrowser()
  }

  /** There is no microphone to be had; the field below is the whole of the call from here. */
  function micUnavailable(why: 'denied' | 'missing') {
    micOk.current = false
    ear.current = null
    setCanListen(false)
    setNote(why === 'denied' ? STRINGS[lang].micDenied : STRINGS[lang].noMic)
  }

  /**
   * The clip path: record what the caller says, post it to `/listen`, and send the words it
   * answers with to `/turn` exactly as a typed message goes. The microphone is asked for once
   * and held for the call, so the second clip of a conversation does not re-prompt.
   */
  async function record() {
    // `arming` covers the await below: the permission prompt can be on screen for as long as the
    // caller looks at it, and a second tap in that window would start a second recorder.
    if (!callId.current || !micOk.current || recorder.current || arming.current) return
    arming.current = true
    try {
      hush()
      // A new clip is the answer to whatever the last band said; it goes when the caller retries,
      // not when the reply to it eventually lands.
      setError(null)
      heard.current = null
      chunks.current = []

      if (!stream.current) {
        try {
          stream.current = await navigator.mediaDevices.getUserMedia({ audio: true })
        } catch (denial) {
          // A refusal, or a device that is not there. Either way the browser's own recogniser
          // would ask for the same microphone and be told the same thing, so there is nothing to
          // fall back to but the field.
          const name = (denial as { name?: string } | null)?.name
          micUnavailable(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'missing')
          setActivity(null)
          return
        }
        // The caller hung up while the permission prompt was on screen.
        if (!callId.current) {
          releaseMic()
          return
        }
      }

      let rec: MediaRecorder
      const type = clipType()
      try {
        rec = new MediaRecorder(stream.current, type ? { mimeType: type } : {})
      } catch {
        // MediaRecorder exists but will not record this stream. It will not next time either.
        fallBack()
        listen()
        return
      }
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.current.push(e.data)
      }
      rec.onstop = () => {
        if (clipTimer.current !== null) {
          clearTimeout(clipTimer.current)
          clipTimer.current = null
        }
        recorder.current = null
        const parts = chunks.current
        chunks.current = []
        setActivity((a) => (a === 'recording' ? null : a))
        if (!callId.current) return
        // `rec.mimeType` is what the browser actually recorded, codec parameters and all; the
        // route compares the media type alone. Nothing recorded is a tab that could not capture,
        // not silence — posting it would bill the ledger for a clip that never existed.
        const clip = new Blob(parts, { type: rec.mimeType || 'audio/webm' })
        if (clip.size === 0) {
          onSilence()
          return
        }
        void transcribe(clip, heard.current)
      }
      recorder.current = rec
      try {
        rec.start()
      } catch {
        recorder.current = null
        fallBack()
        listen()
        return
      }
      setActivity('recording')
      clipTimer.current = window.setTimeout(endClip, MAX_CLIP_MS)
      if (mockStt) listenAlongside()
    } finally {
      arming.current = false
    }
  }

  /**
   * Ends the clip the way the caller means it. Where the browser's recogniser is running beside
   * the recorder, it is asked to `stop()` — not `abort()` — so it delivers the words it has
   * before ending, because under the mock those words are the only ones there will ever be; its
   * `onend` then stops the recorder. The timer is the backstop for a recogniser that does not
   * answer, and `onstop` clears it.
   */
  function endClip() {
    const r = recogniser.current
    if (!r) {
      stopRecording()
      return
    }
    if (clipTimer.current !== null) clearTimeout(clipTimer.current)
    clipTimer.current = window.setTimeout(stopRecording, RECOGNISER_FLUSH_MS)
    try {
      r.stop()
    } catch {
      stopRecording()
    }
  }

  /**
   * Mock only. The mock adapter has bytes and no way to know what is on them, so the browser's
   * recogniser runs beside the recorder and supplies the words (`SttRequest.mockTranscript`);
   * the route, the ledger, the confidence gate and the turn then run for real with no whisper
   * server anywhere. Its `onend` is also free endpoint detection, so the caller does not have to
   * tap twice. Never started against a live recogniser — that would put the audio back on the
   * wire ADR 0007 took it off.
   */
  function listenAlongside() {
    const Ctor = recogniserCtor()
    if (!Ctor || recogniser.current) return
    const r = new Ctor()
    r.lang = BCP47[lang]
    r.continuous = false
    r.interimResults = false
    r.maxAlternatives = 1
    r.onresult = (e) => {
      const alt = e.results[0]?.[0]
      const said = alt?.transcript.trim()
      if (!alt || !said) return
      // WebKit reports 0 for every result; only a real reading is worth handing on, and the mock
      // supplies its own 0.95 when none is given rather than reading a zero as low confidence.
      heard.current = { text: said, confidence: alt.confidence > 0 ? alt.confidence : undefined }
    }
    r.onerror = (e) => {
      if (e.error !== 'not-allowed' && e.error !== 'service-not-allowed') return
      // getUserMedia was allowed and this was not: a clip is being recorded that nothing can
      // read. Throw it away rather than post a clip the mock will answer with silence.
      cancelRecording()
      micUnavailable('denied')
    }
    r.onend = () => {
      recogniser.current = null
      stopRecording()
    }
    recogniser.current = r
    try {
      r.start()
    } catch {
      recogniser.current = null
    }
  }

  /** Ends the clip and lets `onstop` post it. */
  function stopRecording() {
    const rec = recorder.current
    if (!rec) return
    if (rec.state !== 'inactive') {
      rec.stop()
      return
    }
    recorder.current = null
    setActivity((a) => (a === 'recording' ? null : a))
  }

  /** Ends the clip and throws it away: the caller is doing something else now. */
  function cancelRecording() {
    const rec = recorder.current
    if (!rec) return
    rec.ondataavailable = null
    rec.onstop = null
    recorder.current = null
    chunks.current = []
    if (clipTimer.current !== null) {
      clearTimeout(clipTimer.current)
      clipTimer.current = null
    }
    if (rec.state !== 'inactive') rec.stop()
    setActivity((a) => (a === 'recording' ? null : a))
  }

  /**
   * POST /listen — the clip in, the words out. Deliberately not fused with `/turn`: transcribing
   * and answering are separate failures, and a clip nobody could hear should be said again, not
   * answered (the route's own note says the same).
   */
  async function transcribe(clip: Blob, alongside: Heard | null) {
    const id = callId.current
    if (!id) return
    setActivity('thinking')

    const form = new FormData()
    form.append('audio', clip, 'clip')
    form.append('lang', lang)
    // Only under the mock. The route refuses this field against any other adapter, so it can
    // never become a way to put words in a caller's mouth (src/adapters/stt/index.ts).
    if (mockStt && alongside) {
      form.append('mockTranscript', alongside.text)
      if (alongside.confidence !== undefined) form.append('mockConfidence', String(alongside.confidence))
    }

    let res: Response
    try {
      res = await fetch(`/api/v1/voice/calls/${id}/listen`, { method: 'POST', body: form })
    } catch {
      clipFailed(id, alongside, 'listen', true)
      return
    }
    // The caller hung up while the clip was in flight: what was on it is nobody's now.
    if (callId.current !== id) return
    if (res.status === 409) {
      finish({})
      return
    }
    // The clip, not the path: a shorter one will go through, so nothing is given up.
    if (res.status === 413) {
      clipFailed(id, alongside, 'tooLong', false)
      return
    }
    // 415 is what this browser records; 400 is the shape of what was sent. Both will be the same
    // next time, so this counts as final however few clips have failed.
    if (res.status === 415 || res.status === 400) {
      fallBack()
      clipFailed(id, alongside, 'listen', false)
      return
    }
    if (!res.ok) {
      // 502 is the recogniser: no whisper server, or one that answered with an error — ADR 0007
      // runs it as a process someone has to have started. 500 and 401 are ours, no more retryable.
      clipFailed(id, alongside, 'listen', true)
      return
    }

    const said = (await res.json()) as { text: string; confidence: number | null; seconds: number }
    if (callId.current !== id) return
    clipFails.current = 0
    const words = said.text.trim()
    // Silence is a 200 with no words, not an error. Same treatment as an empty recogniser run:
    // listen again, ask once, then let the timer decide.
    if (!words) {
      setActivity(null)
      onSilence()
      return
    }
    // `confidence` is null where the provider does not report one. Build Spec §5.3 gates on 0.6
    // and "unknown" is not "low", so a null is sent as nothing at all, never as a number.
    void send(words, { confidence: said.confidence ?? undefined, typed: false })
  }

  /**
   * A clip did not come back as words. Where the browser's own recogniser was running beside it
   * — under the mock, always — those are the same words by a worse route, so they go to `/turn`
   * and the caller loses nothing. Where it was not, the caller is told, and the field below is
   * still there, as it has been in every state on this page.
   */
  function clipFailed(id: string, alongside: Heard | null, why: 'listen' | 'tooLong', repeatable: boolean) {
    if (callId.current !== id) return
    if (repeatable) {
      clipFails.current += 1
      if (clipFails.current >= CLIP_FAILURES_BEFORE_FALLBACK) fallBack()
    }
    if (alongside && alongside.text) {
      void send(alongside.text, { confidence: alongside.confidence, typed: false })
      return
    }
    setActivity(null)
    setError(why)
  }

  /** The browser's own recogniser: Chrome only, and the audio goes to Google (this file's header). */
  function listenBrowser() {
    const Ctor = recogniserCtor()
    if (!Ctor || !micOk.current || !callId.current || recogniser.current) return
    hush()
    const r = new Ctor()
    r.lang = BCP47[lang]
    r.continuous = false
    r.interimResults = false
    r.maxAlternatives = 1
    let heard = false
    r.onresult = (e) => {
      const alt = e.results[0]?.[0]
      const said = alt?.transcript.trim()
      if (!alt || !said) return
      heard = true
      // WebKit reports 0 for every result; the loop treats a missing confidence as understood,
      // a zero as two low turns and a handoff. Only a real reading is worth the guardrail.
      void send(said, { confidence: alt.confidence > 0 ? alt.confidence : undefined, typed: false })
    }
    r.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') micUnavailable('denied')
      // 'no-speech' and the rest are followed by onend, which decides what happens next.
    }
    r.onend = () => {
      recogniser.current = null
      setActivity((a) => (a === 'listening' ? null : a))
      if (heard || !callId.current || !micOk.current) return
      onSilence()
    }
    recogniser.current = r
    try {
      r.start()
      setActivity('listening')
    } catch {
      recogniser.current = null
    }
  }

  /** A recogniser run ended with nothing: listen again, then ask once, then let the timer decide. */
  function onSilence() {
    emptyRuns.current += 1
    const n = emptyRuns.current
    if (n === PROMPT_AFTER_EMPTY) {
      // Spoken by the page, not the loop, so it is not a call_turn — the spec's silence prompt
      // belongs to the transport (Build Spec §5.3).
      append('ai', s.areYouThere)
      silenceTimer.current = window.setTimeout(() => void hangUp('silence'), SILENCE_MS)
      speak(s.areYouThere, lang, () => {
        setActivity(null)
        listen()
      })
      return
    }
    if (n <= LAST_AUTO_LISTEN) listen()
  }

  async function start() {
    setPhase('connecting')
    setError(null)
    setLines([])
    setEnded({})
    // iOS lets a page speak only from inside a tap's call stack, once; an empty utterance here,
    // before the await, is that once. Elsewhere it ends at once and costs nothing.
    if (typeof SpeechSynthesisUtterance !== 'undefined') synth()?.speak(new SpeechSynthesisUtterance(''))
    let res: Response
    try {
      res = await fetch('/api/v1/voice/session-init', {
        method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ slug, transport: 'browser', lang }),
      })
    } catch {
      setPhase('idle')
      setError('start')
      return
    }
    if (!res.ok) {
      setPhase('idle')
      setError('start')
      return
    }
    const init = (await res.json()) as { callId: string; greeting: string; lang: Lang }
    callId.current = init.callId
    emptyRuns.current = 0
    clipFails.current = 0
    setPhase('live')
    // The greeting may be in the caller's preferred language rather than the page's (Build Spec
    // §5.2); it is shown and spoken in the language it was written in.
    append('ai', init.greeting, init.lang)
    speak(init.greeting, init.lang, () => {
      setActivity(null)
      listen()
    })
  }

  async function send(said: string, via: { confidence: number | undefined; typed: boolean }) {
    const id = callId.current
    if (!id) return
    stopListening()
    hush()
    clearSilence()
    emptyRuns.current = 0
    setError(null)
    append('customer', said)
    setActivity('thinking')

    // Build Spec §5.4: "Play a short filler ('ek second') when a turn exceeds 1.2 s, once per turn
    // at most." A turn is two to four model calls, so it routinely does; without this the caller
    // hears nothing at all and starts talking over the reply. `hush()` inside speak() cuts the
    // filler off when the real reply arrives, which is what a person would do too.
    const filler = window.setTimeout(() => {
      if (callId.current === id) speak(s.thinking, lang, () => undefined)
    }, FILLER_AFTER_MS)
    const done = () => window.clearTimeout(filler)

    let res: Response
    try {
      res = await fetch(`/api/v1/voice/calls/${id}/turn`, {
        method: 'POST',
        headers: JSON_HEADERS,
        body: JSON.stringify({ text: said, lang, ...(via.confidence === undefined ? {} : { confidence: via.confidence }) }),
      })
    } catch {
      done()
      if (callId.current !== id) return
      setActivity(null)
      setError('send')
      if (via.typed) setText(said)
      return
    }
    done()
    // The caller hung up while this was in flight: the reply is nobody's now.
    if (callId.current !== id) return
    if (res.status === 409) {
      finish({})
      return
    }
    if (res.status === 500) {
      // The loop has already ended the call `failed` (M2 design "Error handling").
      finish({ outcome: 'failed' })
      return
    }
    if (!res.ok) {
      setActivity(null)
      setError('send')
      if (via.typed) setText(said)
      return
    }
    const turn = (await res.json()) as TurnResult
    append('ai', turn.reply)
    if (turn.ended) {
      finish({ ...(turn.outcome ? { outcome: turn.outcome } : {}), ...(turn.orderId ? { orderId: turn.orderId } : {}) })
      speak(turn.reply, lang, () => setActivity(null))
      return
    }
    speak(turn.reply, lang, () => {
      setActivity(null)
      // A caller who typed is not re-armed for the microphone: a mic that keeps listening to a
      // silent room would ask "Are you there?" and hang up on someone mid-sentence at the keyboard.
      if (!via.typed) listen()
    })
  }

  /** The call is over, whichever side ended it. */
  function finish(e: Ended) {
    callId.current = null
    stopListening()
    clearSilence()
    // The microphone was held for the length of the call and no longer; the recording indicator
    // goes out at the same moment the call does.
    releaseMic()
    clipFails.current = 0
    setEnded(e)
    setPhase('ended')
    setActivity(null)
  }

  async function hangUp(reason: string) {
    const id = callId.current
    if (!id) return
    hush()
    finish({})
    try {
      await fetch(`/api/v1/voice/calls/${id}/end`, { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ reason }) })
    } catch {
      // Offline: pagehide will try once more; the row stays open otherwise (see the final report).
    }
  }

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const said = text.trim()
    if (!said || activity === 'thinking') return
    setText('')
    void send(said, { confidence: undefined, typed: true })
  }

  /** Focusing the field says "I am here": no silence prompt while someone types. */
  function onFocusText() {
    stopListening()
    clearSilence()
    emptyRuns.current = 0
  }

  /**
   * The one microphone button. While a clip is recording it is the stop — which is the whole of
   * the endpoint detection wherever no recogniser is running beside the recorder to find the end
   * of a sentence, and a labelled button rather than a gesture is what design §6.2 asks for.
   */
  function onMic() {
    if (recorder.current) endClip()
    else listen()
  }

  // One band, the existing one (design §7.10.1): the page has two live regions and a review has
  // already found that too many. Nothing here announces itself that the activity line cannot.
  const liveError =
    error === 'send' ? s.sendFailed : error === 'listen' ? s.listenFailed : error === 'tooLong' ? s.clipTooLong : null

  const outcomeLine = ended.orderId
    ? s.orderPlaced
    : ended.outcome === 'handoff' || ended.outcome === 'cap_transfer'
      ? s.handedOff
      : ended.outcome === 'failed'
        ? s.failed
        : null

  return (
    <div className={styles.call}>
      {phase === 'idle' && (
        <>
          {/* Design §7: the customer surface's one brand CTA, 56 px. */}
          <Button variant="brand" size="counter" block onClick={() => void start()}>
            {s.call.replace('{restaurant}', restaurant)}
          </Button>
          {error === 'start' && <Band tone="attention">{s.startFailed}</Band>}
          <p className={styles.limit}>{s.limit}</p>
        </>
      )}
      {phase === 'connecting' && (
        <Button variant="brand" size="counter" block disabled>{s.connecting}</Button>
      )}

      {note && <p className={styles.limit}>{note}</p>}

      {lines.length > 0 && (
        // Every line carries its language for the screen reader (design §9); the box is polite,
        // so a reply is announced as it is spoken.
        <ol ref={list} className={styles.transcript} role="list">
          {lines.map((l) => (
            <li key={l.id} lang={l.lang} className={`${styles.line} ${l.speaker === 'ai' ? styles.ai : styles.customer}`}>
              <span className={styles.who}>{l.speaker === 'ai' ? restaurant : s.you}</span>
              {l.text}
            </li>
          ))}
        </ol>
      )}

      {phase === 'live' && (
        <div className={styles.controls}>
          {/* The one place a state on this page is announced: "Recording…" reaches a screen
              reader here, not by a second region competing with it. */}
          <p className={styles.activity} role="status">{activity ? s[activity] : ''}</p>
          {liveError && <Band tone="attention">{liveError}</Band>}
          {canListen && (
            // Tapping while the reply is still being spoken is the barge-in; tapping while a clip
            // is recording ends it. The label carries the state in words, never the colour alone.
            <Button variant="brand" size="counter" block onClick={onMic} disabled={activity === 'thinking'}>
              {activity === 'recording' ? s.tapToStop : activity === 'listening' ? s.listening : s.tapToSpeak}
            </Button>
          )}
          <form onSubmit={submit} className={styles.typeRow}>
            <Field id="call-text" label={s.typeInstead}>
              {(input) => (
                <input
                  {...input}
                  className={fieldStyles.control}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onFocus={onFocusText}
                  autoComplete="off"
                  enterKeyHint="send"
                  maxLength={1000}
                />
              )}
            </Field>
            <Button type="submit" variant="ghost" size="counter" disabled={activity === 'thinking'}>
              {s.send}
            </Button>
          </form>
          <Button variant="ghost" size="counter" block onClick={() => void hangUp('hangup')}>{s.endCall}</Button>
        </div>
      )}

      {phase === 'ended' && (
        <div className={styles.controls}>
          <p className={styles.endedTitle} role="status">{s.ended}</p>
          {outcomeLine && <p className={styles.lead}>{outcomeLine}</p>}
          {ended.orderId && (
            <Button href={`/r/${slug}/order/${ended.orderId}`} variant="brand" size="counter" block>{s.viewOrder}</Button>
          )}
          <Button href={`/r/${slug}`} variant="ghost" size="counter" block>{s.backToMenu}</Button>
        </div>
      )}
    </div>
  )
}
