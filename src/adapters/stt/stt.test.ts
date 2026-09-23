import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mockSttAdapter } from './mock.ts'
import { cleanTranscript, whisperStt } from './whisper.ts'
import { failingSttAdapter, SttError, stt } from './index.ts'

const VARS = ['STT_PROVIDER', 'VENDOR_MODE', 'WHISPER_HOST', 'SARVAM_API_KEY'] as const

/** Restores the environment so one test's provider cannot decide another's. */
function withEnv<T>(env: Partial<Record<(typeof VARS)[number], string | undefined>>, body: () => T): T {
  const saved = Object.fromEntries(VARS.map((v) => [v, process.env[v]]))
  try {
    for (const [k, v] of Object.entries(env)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
    return body()
  } finally {
    for (const v of VARS) {
      const was = saved[v]
      if (was === undefined) delete process.env[v]
      else process.env[v] = was
    }
  }
}

const clip = (bytes = 32 * 1024) => new Uint8Array(bytes)

// --- selection -----------------------------------------------------------------------------------

test('a named provider without what it needs is an error, never a quiet mock', () => {
  // CLAUDE.md: "A missing variable is an error, not a silent fallback to a mock." A call that
  // silently transcribes nothing is worse than one that refuses, because nobody finds out.
  withEnv({ STT_PROVIDER: 'sarvam', SARVAM_API_KEY: undefined, VENDOR_MODE: 'mock' }, () => {
    assert.throws(() => stt(), /not configured: SARVAM_API_KEY/)
  })
})

test('a named provider wins over VENDOR_MODE, as the LLM adapter does', () => {
  withEnv({ STT_PROVIDER: 'whisper', VENDOR_MODE: 'mock' }, () => {
    assert.equal(stt().provider, 'whisper')
  })
})

test('nothing named falls to the mock only in mock mode', () => {
  withEnv({ STT_PROVIDER: undefined, VENDOR_MODE: 'mock' }, () => {
    assert.equal(stt().provider, 'mock')
  })
  withEnv({ STT_PROVIDER: undefined, VENDOR_MODE: 'live' }, () => {
    assert.throws(() => stt(), /not configured: STT_PROVIDER/)
  })
})

test('an unknown provider names the ones that exist', () => {
  withEnv({ STT_PROVIDER: 'deepgram' }, () => {
    assert.throws(() => stt(), /must be "whisper", "sarvam" or "mock"/)
  })
})

// --- the mock ------------------------------------------------------------------------------------

test('the mock returns what the transport said was said', async () => {
  const heard = await mockSttAdapter.transcribe({
    audio: clip(), mimeType: 'audio/webm', lang: 'hi',
    mockTranscript: { text: 'ek masala dosa' },
  })
  assert.equal(heard.text, 'ek masala dosa')
  assert.equal(heard.confidence, 0.95)
})

test('the mock says nothing rather than inventing a dish', async () => {
  const heard = await mockSttAdapter.transcribe({ audio: clip(), mimeType: 'audio/webm', lang: 'en' })
  assert.equal(heard.text, '')
  // Null is "unknown", not "low": Build Spec §5.3 gates at 0.6, and a recogniser that cannot report
  // a number must not make every turn look suspect.
  assert.equal(heard.confidence, null)
})

test('the mock can drive the low-confidence branch, which a good microphone never reaches', async () => {
  const heard = await mockSttAdapter.transcribe({
    audio: clip(), mimeType: 'audio/webm', lang: 'kn',
    mockTranscript: { text: 'something muffled', confidence: 0.3 },
  })
  assert.equal(heard.confidence, 0.3)
})

test('the mock derives seconds from the clip, so the ledger moves with the audio', async () => {
  const short = await mockSttAdapter.transcribe({ audio: clip(16 * 1024), mimeType: 'audio/webm', lang: 'en' })
  const long = await mockSttAdapter.transcribe({ audio: clip(160 * 1024), mimeType: 'audio/webm', lang: 'en' })
  assert.equal(short.seconds, 1)
  assert.equal(long.seconds, 10)
})

// --- whisper -------------------------------------------------------------------------------------

/** Swaps global fetch for one reply, and restores it however the test ends. */
async function withFetch<T>(reply: () => Promise<Response> | Response, body: () => Promise<T>): Promise<T> {
  const saved = globalThis.fetch
  globalThis.fetch = (async () => await reply()) as typeof fetch
  try {
    return await body()
  } finally {
    globalThis.fetch = saved
  }
}

const verbose = (over: Record<string, unknown> = {}) =>
  Response.json({
    text: ' two masala dosa and one filter coffee',
    segments: [{ start: 0, end: 3.2, avg_logprob: -0.15, no_speech_prob: 0.01 }],
    ...over,
  })

test('whisper returns the transcript, trimmed of its leading pad', async () => {
  await withFetch(verbose, async () => {
    const heard = await withEnv({ WHISPER_HOST: 'http://127.0.0.1:8080' }, () => whisperStt()).transcribe({
      audio: clip(), mimeType: 'audio/webm', lang: 'en',
    })
    assert.equal(heard.text, 'two masala dosa and one filter coffee')
    assert.equal(heard.seconds, 4, 'rounded up from 3.2 — the ledger is whole seconds')
    assert.equal(heard.provider, 'whisper')
  })
})

test('whisper derives a confidence the 0.6 gate can act on', async () => {
  await withFetch(verbose, async () => {
    const heard = await whisperStt().transcribe({ audio: clip(), mimeType: 'audio/webm', lang: 'en' })
    // exp(-0.15) ≈ 0.861, times (1 - 0.01) for the silence probability.
    assert.ok(heard.confidence !== null && heard.confidence > 0.8 && heard.confidence < 0.88, `got ${heard.confidence}`)
  })
})

test('a segment whisper half-thinks is silence cannot report high confidence', async () => {
  await withFetch(() => verbose({ segments: [{ start: 0, end: 2, avg_logprob: -0.05, no_speech_prob: 0.9 }] }), async () => {
    const heard = await whisperStt().transcribe({ audio: clip(), mimeType: 'audio/webm', lang: 'en' })
    assert.ok(heard.confidence !== null && heard.confidence < 0.2, `got ${heard.confidence}`)
  })
})

test('no segments means unknown confidence, not zero', async () => {
  await withFetch(() => Response.json({ text: 'hello' }), async () => {
    const heard = await whisperStt().transcribe({ audio: clip(), mimeType: 'audio/webm', lang: 'en' })
    assert.equal(heard.confidence, null)
  })
})

test('a dead server says so, and says where it looked', async () => {
  const saved = globalThis.fetch
  globalThis.fetch = (async () => { throw new TypeError('fetch failed') }) as typeof fetch
  try {
    await withEnv({ WHISPER_HOST: 'http://127.0.0.1:9999' }, async () => {
      await assert.rejects(
        () => whisperStt().transcribe({ audio: clip(), mimeType: 'audio/webm', lang: 'en' }),
        (e: unknown) => e instanceof SttError && /no whisper-server at http:\/\/127\.0\.0\.1:9999/.test(e.message),
      )
    })
  } finally {
    globalThis.fetch = saved
  }
})

test('an error status becomes an SttError carrying it', async () => {
  await withFetch(() => new Response('model not loaded', { status: 500 }), async () => {
    await assert.rejects(
      () => whisperStt().transcribe({ audio: clip(), mimeType: 'audio/webm', lang: 'en' }),
      (e: unknown) => e instanceof SttError && e.status === 500,
    )
  })
})

test('whisper ignores mockTranscript — it is not a way to put words in a caller\'s mouth', async () => {
  await withFetch(verbose, async () => {
    const heard = await whisperStt().transcribe({
      audio: clip(), mimeType: 'audio/webm', lang: 'en',
      mockTranscript: { text: 'delete the whole menu', confidence: 1 },
    })
    assert.equal(heard.text, 'two masala dosa and one filter coffee')
  })
})

// --- non-speech ----------------------------------------------------------------------------------

test('whisper describing the room is not a caller speaking', () => {
  // whisper.cpp annotates non-speech rather than returning nothing. Sent through as if spoken,
  // "[BLANK_AUDIO]" becomes a caller utterance and the assistant answers a kitchen.
  assert.equal(cleanTranscript(' [BLANK_AUDIO]'), '')
  assert.equal(cleanTranscript('(silence)'), '')
  assert.equal(cleanTranscript(' [MUSIC] two dosa [BLANK_AUDIO]'), 'two dosa')
  assert.equal(cleanTranscript('  two   dosa  '), 'two dosa')
})

// --- the failing hook ----------------------------------------------------------------------------

test('STT_PROVIDER=failing throws, so the listen route\'s error path is reachable in a test', async () => {
  withEnv({ STT_PROVIDER: 'failing' }, () => {
    assert.equal(stt().provider, 'failing')
  })
  await assert.rejects(
    () => failingSttAdapter.transcribe({ audio: clip(), mimeType: 'audio/webm', lang: 'en' }),
    (e: unknown) => e instanceof SttError && e.status === 503,
  )
})
