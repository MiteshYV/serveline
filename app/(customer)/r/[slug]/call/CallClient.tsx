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
 * The browser transport of the call assistant (M2 design "Surfaces", ADR 0004): the page's
 * `SpeechRecognition` in the page's language, the reply spoken with `speechSynthesis` in the
 * same language and shown as a transcript. Feature-detected: no recogniser, or no microphone
 * permission, and the field below is the only input — it is there in every state regardless.
 *
 * One component, no dependency, no webfont: the ordering page's budget (Build Spec §6) applies
 * to this route too.
 */

type Props = { slug: string; restaurant: string; lang: Lang }

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

const JSON_HEADERS = { 'content-type': 'application/json' }

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
  thinking: string
  speaking: string
  tapToSpeak: string
  typeInstead: string
  send: string
  endCall: string
  areYouThere: string
  noVoice: string
  micDenied: string
  noRecognition: string
  startFailed: string
  sendFailed: string
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
    thinking: 'One moment…',
    speaking: 'Speaking…',
    tapToSpeak: 'Tap to speak',
    typeInstead: 'Type instead',
    send: 'Send',
    endCall: 'End call',
    areYouThere: 'Are you there?',
    noVoice: 'No {language} voice on this device — text still works',
    micDenied: 'Microphone not allowed — text still works',
    noRecognition: 'This browser cannot listen — type instead',
    startFailed: 'Could not start the call. Try again.',
    sendFailed: 'That did not reach the restaurant. Try again.',
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
    thinking: 'एक सेकंड…',
    speaking: 'बोल रहे हैं…',
    tapToSpeak: 'बोलने के लिए टैप करें',
    typeInstead: 'इसके बजाय टाइप करें',
    send: 'भेजें',
    endCall: 'कॉल समाप्त करें',
    areYouThere: 'क्या आप वहाँ हैं?',
    noVoice: 'इस डिवाइस पर {language} आवाज़ नहीं है — टेक्स्ट फिर भी काम करता है',
    micDenied: 'माइक्रोफ़ोन की अनुमति नहीं है — टेक्स्ट फिर भी काम करता है',
    noRecognition: 'यह ब्राउज़र सुन नहीं सकता — टाइप करें',
    startFailed: 'कॉल शुरू नहीं हो सकी। फिर कोशिश करें।',
    sendFailed: 'यह रेस्टोरेंट तक नहीं पहुँचा। फिर कोशिश करें।',
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
    thinking: 'ಒಂದು ಕ್ಷಣ…',
    speaking: 'ಮಾತನಾಡುತ್ತಿದ್ದೇವೆ…',
    tapToSpeak: 'ಮಾತನಾಡಲು ಟ್ಯಾಪ್ ಮಾಡಿ',
    typeInstead: 'ಬದಲಿಗೆ ಟೈಪ್ ಮಾಡಿ',
    send: 'ಕಳುಹಿಸಿ',
    endCall: 'ಕರೆ ಮುಗಿಸಿ',
    areYouThere: 'ನೀವು ಇದ್ದೀರಾ?',
    noVoice: 'ಈ ಸಾಧನದಲ್ಲಿ {language} ಧ್ವನಿ ಇಲ್ಲ — ಪಠ್ಯ ಇನ್ನೂ ಕೆಲಸ ಮಾಡುತ್ತದೆ',
    micDenied: 'ಮೈಕ್ರೊಫೋನ್‌ಗೆ ಅನುಮತಿ ಇಲ್ಲ — ಪಠ್ಯ ಇನ್ನೂ ಕೆಲಸ ಮಾಡುತ್ತದೆ',
    noRecognition: 'ಈ ಬ್ರೌಸರ್ ಕೇಳಲು ಸಾಧ್ಯವಿಲ್ಲ — ಟೈಪ್ ಮಾಡಿ',
    startFailed: 'ಕರೆ ಪ್ರಾರಂಭಿಸಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.',
    sendFailed: 'ಇದು ರೆಸ್ಟೋರೆಂಟ್ ತಲುಪಲಿಲ್ಲ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.',
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
type Activity = 'listening' | 'thinking' | 'speaking' | null
type Ended = { outcome?: TurnResult['outcome']; orderId?: string }

export function CallClient({ slug, restaurant, lang }: Props) {
  const s = STRINGS[lang]
  const [phase, setPhase] = useState<Phase>('idle')
  const [activity, setActivity] = useState<Activity>(null)
  const [lines, setLines] = useState<Line[]>([])
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<'start' | 'send' | null>(null)
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

  useEffect(() => {
    // Feature detection after mount: the server rendered the text-only page and hydration must
    // match it. The voice list arrives asynchronously in Chrome, hence the listener.
    if (recogniserCtor()) setCanListen(true)
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
      if (silenceTimer.current !== null) clearTimeout(silenceTimer.current)
      sy?.cancel()
    }
  }, [lang])

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

  /** Detaches before aborting, so the run's onend never counts as a silence. */
  function stopListening() {
    const r = recogniser.current
    if (!r) return
    r.onend = null
    r.onresult = null
    r.abort()
    recogniser.current = null
    setActivity((a) => (a === 'listening' ? null : a))
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

  /** Barge-in (design "Surfaces": speaking stops the voice): starting to listen cancels speech. */
  function listen() {
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
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        micOk.current = false
        setCanListen(false)
        setNote(STRINGS[lang].micDenied)
      }
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
          <p className={styles.activity} role="status">{activity ? s[activity] : ''}</p>
          {error === 'send' && <Band tone="attention">{s.sendFailed}</Band>}
          {canListen && (
            // Tapping while the reply is still being spoken is the barge-in.
            <Button variant="brand" size="counter" block onClick={listen} disabled={activity === 'thinking'}>
              {activity === 'listening' ? s.listening : s.tapToSpeak}
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
