# ADR 0009 — Speech to text is an adapter, and it runs on the restaurant's own machine

Date: 23 September 2026
Status: Accepted
Follows: ADR 0007 (which measured whisper and left it unwired), ADR 0004 (the brain in TypeScript)
Amends: Build Spec §3 (Sarvam as the speech vendor), §5.6 (the voice service contract)

## Context

ADR 0007 measured `whisper.cpp` with `large-v3-turbo` on an M2 Pro — exact on a 3 s English clip,
correct but for one vowel on Hindi, ~1.9 s warm — called it "the piece worth having", and then
recorded that it "is not wired yet: the browser's recogniser is what `/r/{slug}/call` uses,
and replacing it is transport work that belongs with the Exotel audio path".

That sentence was load-bearing in a way it did not look. The browser's `SpeechRecognition` is a
feature of Chrome, not a feature of this product:

- It does not exist on every browser, and there is no version of it on a telephone.
- It sends the audio to Google, whatever Build Spec §10 says about this product's data living in
  Mumbai. The consent notice a caller agrees to does not mention it.
- It requires a caller holding a device, which is the opposite of the product. ServeLine's premise
  is that a customer rings a restaurant's existing number.

So the phone half of a voice product had never run end to end, and every number measured so far —
the 90-case eval, ADR 0007's own tables — was text in and text out, because there was no other
option. A 100% item-accuracy score means the assistant reasons correctly about Kannada *text*. It
has never been asked to hear Kannada.

## Decision

Speech to text becomes an adapter in `src/adapters/stt/`, the same shape as `src/adapters/llm/`:
an interface, a mock that needs nothing, and providers selected by `STT_PROVIDER`.

**The interface is bytes in, text out** — `{audio, mimeType, lang}` → `{text, confidence, seconds,
provider, model}`. Deliberately transport-shaped: the browser posts a clip it recorded, and the
Python/Exotel transport will post a clip it cut from the line. Neither knows which recogniser
answered.

**`whisper` is the default real provider, and it runs locally.** A `whisper.cpp` server on the
restaurant's own machine, addressed by `WHISPER_HOST`. No account, no per-minute price, and the
audio never leaves the building — which is a stronger answer to §10's residency question than
Sarvam can give, because Sarvam is still a network hop out of the restaurant. ADR 0007's cold-start
figure of 22 s is why this expects a server that stays up rather than a process per clip.

**`sarvam` is written and has never run.** Build Spec §3 names it and there is no account to buy
it with. It exists so that turning it on is an environment variable rather than a change to calling
code, and its file says plainly that its request shape is unverified. The case for it is Kannada and
telephone-band audio, where a model trained on Indian speech should beat a general one — but that
is an expectation, not a measurement, and the eval set is how it gets settled the day an account
appears.

**A new route, `POST /api/v1/voice/calls/{id}/listen`**, rather than folding audio into `/turn`.
Transcribing and answering are separate failures with separate costs: a clip that could not be
heard should be re-recorded, not answered, and only the transport knows whether re-recording is
possible. Multipart rather than JSON because base64 would inflate every clip by a third for nothing.

**The mock takes the words from the transport.** A mock recogniser has an awkward problem — bytes
in, words out, and no way to know which words — and a fixed sentence would make every mocked call
order the same dish. So under `VENDOR_MODE=mock` the browser hands over the words its own
recogniser heard, in a field real providers ignore, and everything else on the path runs for real:
the route, the cost ledger, the confidence gate, the turn. The route refuses that field outright
when a live recogniser is selected, so it can never become a way to put words in a caller's mouth.

**Confidence is derived, and says so.** whisper.cpp reports a mean log probability per token, not
a confidence. `exp(avg_logprob)`, weighted by segment duration and reduced by `no_speech_prob`, is
the closest honest reading — a proxy for how sure the model was of the words it chose, not a
calibrated probability that the transcript is right. Build Spec §5.3 gates on 0.6 and this is the
number that gate sees. Where a provider reports nothing, the answer is `null` meaning *unknown*,
and the gate must not read unknown as low: a recogniser that cannot report a number should not make
every turn suspect.

## Consequences

Good: the product can now hear. `STT_PROVIDER=whisper` with a local server transcribes a clip with
no account and no per-minute charge, and the ledger's `stt_paise` and `stt_seconds` columns — which
`addCost` has had since M2 and could not accept a value for — now fill on every clip.

Good: the eval can finally be what §16 asks for. "These utterances spoken by five people down a
real phone line with kitchen noise playing" now has somewhere to send the audio. That measurement
is the one that decides a pilot, and it will be lower than the text score.

Bad: a second thing to run. A restaurant on `whisper` needs a server up, and a cold one costs 22 s.
`listen` answers 502 when it is not there, and says where it looked, which is the best that can be
done from this side.

Bad: latency. A clip adds ~1.9 s warm to a turn that ADR 0007 already measured at 2.9 s p50
against Build Spec §5.4's 1.8 s p95 budget. Speech does not make that gap worse in kind, but it
makes it worse in size, and §5.4 is now missed by more. The honest reading is that §5.4's budget
was written for a streaming pipeline and this is not one yet.

Unchanged and still open: text to speech. ADR 0007 found Indic TTS locally to be the weak link —
Piper's Hindi voices below Bulbul's and Kannada barely existing — and the browser's own voices
still speak the reply. A telephone caller cannot hear those either, so the Exotel transport needs
a TTS adapter of the same shape before a real call works end to end. This ADR does not build one.
