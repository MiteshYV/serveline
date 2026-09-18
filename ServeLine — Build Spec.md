# ServeLine build spec

> Engineering brief for the ServeLine MVP. Product decisions live in `ServeLine — Ideation.md`; this file covers how to build what that file decided, and nothing it did not decide. Written so a two-person team or Claude Code can start from an empty repository and reach a ten-restaurant pilot in Bangalore.
>
> Version 1, 9 September 2026. Vendor facts (Exotel AgentStream, Sarvam pricing) were checked on that date and should be rechecked at kickoff.

---

## 0. How to use this document

Read the Ideation file first, in full. Sections 6 to 11 there define the product; Section 17 explains why it looks the way it does. Then build in the milestone order of Section 14 here. Each milestone has acceptance criteria written as tests; a milestone is done when they pass, not when the code exists.

If you are Claude Code: Section 15 has the repository layout and the CLAUDE.md to write on day one. Do not skip milestones, do not invent product behaviour that the Ideation file leaves open (ask), and never call a paid vendor without the corresponding environment variable set.

---

## 1. What is being built

One platform, three surfaces, one voice service.

The customer-facing ordering page, a mobile web app at `/r/{slug}`, in two contexts: table (scanned at a table) and delivery (opened from a Direct Order Card, an SMS link or search).

The restaurant dashboard, a mobile-first web app for the owner and counter staff: live orders, order actions, menu availability, settings, cards and codes, billing, the weekly aggregator count.

The agent console for ServeLine's own onboarding agents and admins: restaurant onboarding checklist, menu digitisation, call review and vocabulary tuning, pilot metrics.

The voice service: answers forwarded calls over Exotel's bidirectional audio stream, runs speech recognition, an LLM with tools, and speech synthesis, and talks to the core API to look up customers, search the menu and place orders.

Out of scope for this build, per Ideation Section 11: WhatsApp, upselling, recommendations, loyalty, inventory, kitchen display, SEO configuration, self-serve onboarding, seating, vendor management, multi-location dashboards, languages beyond Hindi, English and Kannada.

---

## 2. System overview

```
                 restaurant's existing number
                            |  (unconditional call forwarding)
                            v
                 +---------------------+
                 |  Exotel             |   flow: Voicebot applet -> AgentStream
                 |  virtual number     |   fallback: dial owner mobile if no
                 |  + App Bazaar flow  |   WebSocket answer within 3 s
                 +----------+----------+
                            |  WebSocket, 8 kHz 16-bit mono PCM (base64)
                            v
+---------------------------+---------------------------+
|  services/voice  (Python, Pipecat)                    |
|  Exotel transport -> Sarvam STT -> LLM (tools) ->     |
|  Sarvam TTS -> Exotel transport                       |
|  session state in Redis; calls core API over HTTPS    |
+---------------------------+---------------------------+
                            |  REST + signed webhooks
                            v
+---------------------------+---------------------------+
|  apps/web  (Next.js, TypeScript)                      |
|  ordering page  |  dashboard  |  agent console  |  API |
|  route handlers: orders, customers, menu, calls,      |
|  billing, webhooks (Exotel, Razorpay, SMS)            |
+------+---------------+---------------+----------------+
       |               |               |
       v               v               v
  Postgres 16      Redis            S3 (Mumbai)
  (Mumbai)         (Mumbai)         recordings, menu photos, card PDFs
       |
       v
  Metabase (read replica) for Section 9 metrics

External: Razorpay (Route linked accounts, payment links, UPI Autopay),
          Exotel or MSG91 SMS on DLT-registered templates,
          LLM vendor behind an adapter.
```

Two deployables: the web app (which is also the API) and the voice service. Everything stateful lives in Mumbai.

---

## 3. Stack decisions

Each choice lists the alternative and the reason. Change a choice if the reason stops being true, and record it.

| Area | Choice | Alternative | Reason |
|---|---|---|---|
| Web and API | Next.js 15 (App Router), TypeScript, Tailwind, route handlers for the API | Separate Fastify API | One deployable for three UIs and the API; fewer moving parts for a small team |
| ORM and migrations | Drizzle | Prisma | Plain SQL visibility, cheap migrations, good Postgres coverage |
| Database | Postgres 16 in Mumbai (Neon ap-south-1, or RDS) | Supabase | Managed, branchable, in region |
| Cache, queues, call session state | Redis (Upstash Mumbai) with BullMQ | Postgres-only queues | Sub-10 ms session reads during a call; scheduled jobs (retention, billing, nags) |
| Object storage | S3 ap-south-1, private buckets, signed URLs | Cloudflare R2 | Region control for DPDP |
| Voice orchestration | Pipecat (Python 3.12), self-hosted in Mumbai | Bolna (Indian, open source, Exotel-ready) to rent the layer for M2 only; Vapi or Retell (no Exotel transport) | Owning the pipeline is where per-restaurant tuning lives (Ideation 13). Pipecat has a documented Exotel transport. Rent Bolna only if M2 slips past three weeks |
| Telephony | Exotel: virtual numbers, App Bazaar flows, Voicebot applet and AgentStream bidirectional streaming, call transfer, recording, SMS | Plivo (audio streams), Knowlarity, Ozonetel | Indian carrier relationships, streaming is documented, one vendor for voice and SMS. Twilio inbound in India is impractical |
| Speech to text | Sarvam speech to text (Saaras v3 at the time of writing; confirm the current model name), streaming, code-mixed Hindi, Kannada, English; ₹1.50 per minute list | Google STT v2 (Chirp); AI4Bharat IndicConformer self-hosted | Trained on Indian speech, code-mixing native, word timestamps. Vocabulary biasing support must be confirmed at kickoff (Section 17) |
| Text to speech | Sarvam Bulbul v3; ₹30 per 10,000 characters beta list | Google TTS; ElevenLabs for Hindi | Eleven Indian languages, Hinglish mid-sentence, low first-byte latency |
| LLM | Any tool-calling model with first token under 500 ms, behind a vendor adapter. Start with Gemini 2.5 Flash; keep Claude Haiku 4.5 wired as the second provider | Sarvam-M if counsel requires in-country inference | Latency and cost. Phone numbers never enter a prompt, so residency exposure is limited to transcript text |
| Payments | Razorpay: Route linked accounts per restaurant, Payment Links with UPI intent, webhooks, UPI Autopay mandates for ServeLine's own invoices | Cashfree Easy Split | Restaurant is the merchant of record; ServeLine never holds funds (Ideation 15) |
| SMS and OTP | Exotel SMS on DLT-registered templates; MSG91 as fallback provider | WhatsApp utility templates (Phase 2) | Same vendor as voice; DLT is mandatory regardless |
| Auth | Phone OTP for everyone; JWT in httpOnly cookies; customer sessions 30 days, staff 7 days | Passwords | Nobody in this market wants a password |
| Hosting | Voice service on Fly.io region `bom` or AWS ECS ap-south-1; web app on Vercel `bom1` or the same ECS | Single VM | Voice must sit near Exotel for latency; web can be serverless |
| Observability | OpenTelemetry traces and logs to Grafana Cloud or Axiom; Sentry for errors; a per-call cost ledger in Postgres | Vendor dashboards only | Cost per call is a product guardrail, not an ops nicety |
| Card PDFs and QR | Server-side `@react-pdf/renderer` plus `qrcode` | Canva templates by hand | Batches of coded cards must be generated, not designed |

Languages in the repository: TypeScript for everything except the voice service, which is Python because the voice ecosystem is. The contract between them is small (Section 5.6) and versioned.

---

## 4. Data model

Postgres. Money in paise as integers. Phone numbers stored in E.164, with a separate `phone_hash` column (SHA-256 with a server pepper) used for analytics and joins that do not need the number. Timestamps in UTC; the app renders Asia/Kolkata. Soft deletes only where DPDP erasure does not apply; erasure is a real delete.

Customer profiles are per restaurant. A `customer` row is the platform identity (one phone, one row); everything the restaurant knows about them hangs off `customer_restaurant`. Nothing crosses restaurants without a new consent, which matches the positioning.

### Tenancy and configuration

`restaurant` (id, name, slug, brand_colour, plan, status: trialing | active | suspended | churned, trial_started_at, trial_call_limit default 150, created_at)

`outlet` (id, restaurant_id, name, address_line, area, pincode, lat, lng, display_phone, virtual_number, forwarding_verified_at, owner_mobile, handoff_number, hours jsonb, holiday_dates date[], delivery_radius_km, serviceable_pincodes text[], languages text[] default {hi,en,kn}, greeting_override, cod_enabled, status)

`staff_user` (id, restaurant_id, phone, phone_hash, name, role: owner | staff, last_login_at)

`platform_user` (id, phone, phone_hash, name, role: agent | admin)

`onboarding_checklist` (restaurant_id, steps jsonb: each step with status and timestamp; see Section 11)

### Menu

`menu` (id, outlet_id, version, published_at, published_by)

`menu_category` (id, menu_id, name, sort)

`menu_item` (id, menu_id, category_id, name, description, price_paise, is_veg, spice_level, allergens text[], tags text[], is_available, sort)

`item_variant` (id, item_id, name, price_delta_paise) for half and full, sizes

`item_option_group` (id, item_id, name, min_select, max_select) and `item_option` (id, group_id, name, price_delta_paise)

`menu_vocabulary` (id, item_id, language: hi | en | kn, alias, alias_transliterated, source: agent | ai | call_correction, confidence, created_at). This table is the speech accuracy lever. It holds transliterations, nicknames and observed mishearings per item per language.

### Customers and consent

`customer` (id, phone, phone_hash, name, preferred_language, created_at)

`customer_restaurant` (customer_id, restaurant_id, source: win_back | organic_call | table | page | staff, first_channel, consent_id, order_count, last_order_at, ltv_paise, usual_order jsonb, notes)

`consent_record` (id, customer_id, restaurant_id, notice_version, purposes text[], channel: call | page | staff, language, granted_at, withdrawn_at, evidence jsonb: call_id or request id and IP)

`customer_address` (id, customer_id, restaurant_id, label, line1, landmark, area, pincode, lat, lng, source: page | voice_rough | staff, is_confirmed, last_used_at)

`customer_preference` (customer_id, restaurant_id, dietary text[], allergies text[], notes)

### Orders and payments

`order` (id, restaurant_id, outlet_id, customer_id nullable, channel: ai_call | page_table | page_delivery | staff_manual, fulfilment: delivery | pickup | dine_in, table_no, status, subtotal_paise, discount_paise, discount_code_id, total_paise, payment_method: upi_link | cod | pay_at_table, payment_status: unpaid | awaiting | paid | refunded, address_id, address_status: na | pending | confirmed, call_id, notes, placed_at, confirmed_at, delivered_at, cancelled_reason, correction_flag, corrected_at, corrected_by)

Order status enum and transitions:

```
received -> confirmed -> preparing -> ready -> out_for_delivery -> delivered
received -> address_pending -> confirmed   (voice orders with a rough address)
received -> awaiting_payment -> confirmed   (UPI link orders)
any non-terminal -> cancelled (reason required)
any -> needs_attention (handoff incomplete; staff completes or cancels)
```

`order_item` (id, order_id, item_id, variant_id, options jsonb, qty, unit_price_paise, name_snapshot)

`order_event` (id, order_id, from_status, to_status, actor_type, actor_id, at)

`payment` (id, order_id, gateway, link_id, payment_id, amount_paise, status, method_detail, webhook_payload jsonb, created_at, paid_at)

### Calls

`call` (id, outlet_id, provider_call_sid, from_phone, from_phone_hash, customer_id nullable, started_at, answered_by: ai | fallback_human | none, language_detected, intent: order | enquiry | other | unknown, outcome: completed | handoff | abandoned | deflected_sms | failed | cap_transfer, handoff_reason, order_id, duration_sec, counts_toward_allowance boolean, ended_at)

`call_turn` (id, call_id, seq, speaker: customer | ai, text, language, asr_confidence, started_ms, ended_ms, tool_calls jsonb)

`call_recording` (id, call_id, s3_key, duration_sec, expires_at)

`call_cost` (call_id, telephony_paise, stt_paise, llm_paise, tts_paise, sms_paise, total_paise, stt_seconds, tts_chars, tokens_in, tokens_out)

### Win-back

`card_batch` (id, restaurant_id, outlet_id, qty, pdf_s3_key, printed_at, placed_at, placement_audited_at, audited_by)

`discount_code` (id, restaurant_id, code, kind: win_back_card | manual, percent, batch_id, per_customer_limit default 1, valid_from, valid_to, is_active)

`code_redemption` (id, code_id, customer_id, order_id, redeemed_at, channel)

### Messaging, metrics inputs, billing, compliance

`sms_message` (id, restaurant_id, to_phone_hash, kind: otp | order_confirm | payment_link | page_link | address_link, dlt_template_id, provider, provider_message_id, status, cost_paise, sent_at)

`external_order_count` (id, outlet_id, week_start, swiggy_orders, zomato_orders, other_orders, entered_by, entered_at). The North Star denominator (Ideation 9).

`usage_ledger` (id, restaurant_id, period_start, period_end, ai_calls, overage_calls, channel_order_value_paise, subscription_paise, overage_paise, fee_paise, total_paise, invoice_id)

`invoice` (id, restaurant_id, period, amount_paise, status: draft | issued | paid | failed, mandate_id, payment_link_id, issued_at, paid_at)

`mandate` (id, restaurant_id, gateway_mandate_id, max_amount_paise, status)

`dsar_request` (id, customer_id, restaurant_id nullable, kind: access | erasure | correction, status, requested_via, requested_at, completed_at, completed_by)

`audit_log` (id, actor_type, actor_id, action, entity, entity_id, before jsonb, after jsonb, at)

Indexes that matter: `customer.phone_hash`, `order (outlet_id, placed_at)`, `order (customer_id, placed_at)`, `call (outlet_id, started_at)`, `menu_vocabulary (item_id, language)`, `code_redemption (code_id, customer_id)` unique, `external_order_count (outlet_id, week_start)` unique.

---

## 5. The AI call pipeline

### 5.1 Telephony path

1. Restaurant dials the carrier's unconditional forwarding code with its Exotel virtual number during onboarding. The agent verifies by calling the display number and hearing the AI.
2. The Exotel App Bazaar flow for that number: Voicebot applet pointing at the voice service's WebSocket URL, with the outlet id as a custom parameter. If the WebSocket is not established within 3 seconds, the flow's failure branch dials `outlet.owner_mobile`. This is the failover and it lives in Exotel, not in ServeLine.
3. Recording is enabled on the flow. The recording URL arrives on the status callback and is copied to S3 within the hour; the Exotel copy is deleted.
4. Human handoff is a transfer to `outlet.handoff_number` via Exotel's call API mid-stream. Confirm at kickoff that transfer is supported while a stream is active; if not, the fallback is to end the stream and have the flow dial the handoff number on the same leg.

### 5.2 Session lifecycle

Pre-call, on WebSocket open: read outlet config and published menu from cache (Redis, refreshed on publish); look up the caller by CLI (`phone_hash`) and load the profile summary if consent exists; assemble the system prompt; pick the greeting.

Greeting: short, bilingual, includes the recording notice. Example in Hindi and English: "Namaste, {restaurant} mein aapka swagat hai. Yeh call quality ke liye record hoti hai. Kya order karna chahenge?" If the profile has `preferred_language`, greet in that language only.

Language detection: from the first customer utterance, using the STT language id. Set TTS voice and language to match. The customer may switch mid-call; the pipeline follows the STT language per turn.

Intent classification: the LLM classifies the first substantive turn as `order`, `enquiry` or `other` and records it on the call. Enquiries (hours, address, is X available, do you deliver to Y) are answered in one turn from outlet config; if a second enquiry turn follows, offer the ordering page by SMS and end.

Returning customer with `usual_order`: the AI offers "same as last time?" with the item names and total. A yes moves straight to address confirmation and payment. This is the thirty-second call.

Order dialogue: menu search is a tool call, never free recall. Items resolve to `menu_item` ids or they do not go in the cart. Prices come from the menu. Ask about allergies once per customer per restaurant if the preference record is empty.

Address: for delivery orders, a returning customer hears their last-used address label read back for confirmation. A new customer gives area and landmark by voice; the AI stores it as `voice_rough`, sends the address link SMS, and the order is created `address_pending`. Serviceability is checked by area or pincode before the read-back.

Read-back: mandatory before `place_order`. Items with quantities, total, delivery or pickup, address label, payment mode. The customer must say yes.

Payment: UPI link by SMS (order becomes `awaiting_payment`, Razorpay webhook moves it to `confirmed`) or cash on delivery (order goes to `confirmed` immediately if `outlet.cod_enabled`). If the link is unpaid after 10 minutes the dashboard flags it.

Post-call: transcript, turn timings, tool calls and costs are written; outcome is classified; the recording is scheduled for copy; `counts_toward_allowance` is set (answered by AI and duration 10 seconds or more); the customer's `usual_order` is refreshed if the order completes.

### 5.3 Guardrails

Confidence gating: if STT confidence averages below 0.6 across two consecutive customer turns, re-ask once; a third low-confidence turn triggers handoff with reason `low_confidence`.

Menu grounding: every cart mutation must reference a menu id returned by `search_menu` in the same session. The API rejects anything else.

Duration cap: 6 minutes, then a polite transfer with reason `cap`.

Silence: 8 seconds without speech prompts once; a second silence ends the call politely and marks it `abandoned`.

Barge-in: enabled; TTS stops within 200 ms when the customer speaks.

Instruction resistance: anything the customer says is data. Spoken text that tries to change prices, policies or the AI's behaviour is ignored by construction because the system prompt and tools own those; the prompt says so.

Abuse: two abusive turns end the call.

Outage: if STT, LLM or TTS fails twice in a session, transfer with reason `vendor_error`. If the voice service is down entirely, Exotel's failover handles it (5.1).

### 5.4 Latency budget

| Stage | Target p50 | Target p95 |
|---|---|---|
| End of speech to final transcript | 300 ms | 500 ms |
| LLM first token | 400 ms | 700 ms |
| TTS first audio byte | 250 ms | 400 ms |
| Turn total (customer stops speaking to AI starts) | 1.0 s | 1.8 s |

Play a short filler ("ek second") when a turn exceeds 1.2 s, once per turn at most.

### 5.5 Prompt architecture

The system prompt is assembled per call from templates plus data, never hand-edited per restaurant. Sections, in order: persona and greeting rules; languages allowed and the rule to answer in the customer's language; operating policies (menu grounding, allergy question, read-back, no invented items, no discounts beyond codes, how to hand off); the outlet card (hours, delivery radius, pickup rules, COD, today's date and time, holidays); the profile summary (first name, usual order, saved address labels, allergies; no phone number, no full address); the tool list.

Tools exposed to the LLM (JSON Schema in `packages/shared`, served by the API):

`search_menu(query, language)`, `add_to_cart(item_id, variant_id?, options?, qty)`, `remove_from_cart(line_id)`, `get_cart()`, `apply_code(code)`, `check_serviceability(area?, pincode?)`, `use_saved_address(address_id)`, `capture_rough_address(text)`, `send_sms(kind)`, `place_order(fulfilment, payment_method)`, `answer_enquiry(kind)`, `transfer_to_human(reason)`, `end_call(reason)`.

Every tool call is logged on `call_turn.tool_calls` with its arguments and result.

### 5.6 Voice service to API contract

The voice service is a client of the API and has no database access. Endpoints it uses, all authenticated with a service token and scoped to an outlet:

`GET /api/v1/voice/session-init?outlet_id&from_phone` returns outlet config, menu snapshot version, profile summary, greeting, prompt sections.
`POST /api/v1/voice/tools/{tool_name}` executes a tool for a session; the API owns cart state in Redis keyed by call id.
`POST /api/v1/voice/calls/{call_id}/turns` appends turns in batches.
`POST /api/v1/voice/calls/{call_id}/end` writes outcome, duration, costs.
`POST /api/v1/webhooks/exotel/status` receives call status and recording URLs (signature verified).

Version the contract in the URL. The voice service pins a version.

---

## 6. Ordering page

Route `/r/{slug}` with `t={table}` or `c={code}`. Server-rendered, under 100 KB of JavaScript, usable on a low-end Android over 3G. No app install, no PWA install prompt in MVP.

Flow: phone entry, OTP (skipped if a valid 30-day session cookie exists), consent checkbox with the versioned notice in the customer's chosen language (hi, en, kn toggle), menu with categories and search, cart, then either table number (pre-filled from `t`) or delivery address (saved addresses first, then a form: line, landmark, area, pincode; serviceability checked on pincode), code applied automatically from `c` or entered by hand, payment by UPI intent through the Razorpay link (deep link on mobile, QR on desktop) or cash on delivery, then an order status page that polls every 10 seconds.

Table context creates a `dine_in` order with `table_no`. There is no table map and no seat management.

Win-back codes: one redemption per phone per restaurant, enforced by the unique index. A second attempt shows the menu without the discount and says so.

Address link from a voice call: `/r/{slug}/address/{token}` opens the address form for a specific `address_pending` order, pre-filled with the rough text. Confirming moves the order to `confirmed` (or `awaiting_payment` if a link is pending).

---

## 7. Restaurant dashboard

Route group `/app`. Phone OTP login for `staff_user`. Mobile-first; it runs on the phone at the counter.

Live orders: a board of open orders ordered by placed time, refreshed by Server-Sent Events with a 5-second polling fallback, an audible alert on new orders that the browser keeps permission for. Each order card shows channel, items, total, payment state, address state, and the next status action. `needs_attention` and `address_pending` orders are pinned to the top.

Order actions: advance status, cancel with reason, mark corrected (sets `correction_flag`, which feeds the error metric), call the customer (tel link), resend payment link, convert to COD.

Manual order entry: for handoff calls the staff finish by hand. Same cart UI as the ordering page, with a phone field that links the order to a profile if consent exists.

Menu: availability toggles per item (sold out today), price edits, item add and edit with variants and options. Publishing bumps `menu.version` and refreshes the voice cache.

Settings: hours and holidays, delivery radius and pincodes, COD on or off, owner mobile and handoff number, greeting override (agent-approved), languages.

Cards and codes: generate a batch (quantity, percent, validity), download the PDF, see redemptions per batch.

Weekly aggregator count: every Monday the dashboard asks for last week's Swiggy and Zomato order counts and does not stop asking until they are entered. Two number fields. This feeds Direct Order Share.

Today and this month: orders by channel, Direct Order Share versus last month, top customers this week, top dishes, AI calls used against allowance, estimated invoice to date.

Billing: current plan, usage, invoices, mandate status.

---

## 8. Agent console

Route group `/agent`. `platform_user` login.

Restaurants: list with onboarding stage, pilot metrics, last call, open issues.

Onboarding checklist per restaurant, the steps in Section 11, each with a done state and timestamp.

Menu digitisation: upload photos of the physical menu; a vision-capable LLM extracts categories, items, prices, variants and veg flags into a draft; the agent corrects it in an editor; the agent presses "generate vocabulary" and the LLM proposes transliterations and common spoken aliases per item in Hindi, English and Kannada, which the agent reviews and saves to `menu_vocabulary`; publish.

Call review: calls filtered by outcome (handoff, abandoned, corrected). Play the recording, read the transcript with per-turn confidence, tag the failure (misheard item, address, intent, vendor, other), and add a vocabulary alias in place. Aliases added here carry `source = call_correction`.

Pilot metrics: the Section 12 views, per restaurant and across the pilot.

Admin only: suspend and reactivate restaurants, edit plan limits, process DSAR requests, view the audit log.

---

## 9. Integrations

### Exotel

Provision one virtual number per outlet. Build the App Bazaar flow programmatically where the API allows, otherwise document the manual flow and keep a screenshot in the repo. Stream format: 8 kHz, 16-bit, mono, little-endian PCM, base64 in JSON frames; the voice service resamples to and from the model rates. Verify webhook signatures. Store `provider_call_sid` on every call. SMS goes through the same account on DLT templates; header and templates are registered before M1 ends.

### Sarvam

Streaming STT with language identification per segment; word timestamps used for barge-in and turn boundaries. TTS streamed by sentence to keep first-byte latency low. Confirm at kickoff whether Saaras v3 accepts a custom vocabulary or hotword list. If it does, push `menu_vocabulary` per outlet at session init. If it does not, run a post-STT correction step: fuzzy-match transcript spans against the outlet's vocabulary (rapidfuzz, transliteration-aware) before the LLM sees the text, and log corrections for review.

### LLM

Adapter interface with `complete(messages, tools, stream=true)`. Two providers wired from the start so a vendor outage is a config change. Log tokens per call to `call_cost`. No phone numbers or full addresses in prompts.

### Razorpay

Each restaurant is onboarded as a Route linked account during the agent visit (KYC documents: PAN, bank proof, FSSAI where available; allow 2 to 5 working days). Orders create a Payment Link for the linked account with UPI intent enabled and a 30-minute expiry. Webhooks (`payment_link.paid`, `payment.captured`) are verified and idempotent. ServeLine's own invoices are collected through a UPI Autopay mandate created at onboarding with a ceiling of ₹15,000, and fall back to a payment link if the mandate fails.

### SMS

Kinds and templates: OTP, order confirmation (items, total, payment mode), payment link, ordering page link (enquiry deflection), address link. All on DLT-registered templates with the header registered to ServeLine. Cost is logged per message.

---

## 10. Security, privacy and DPDP

Data residency: Postgres, Redis and S3 in Mumbai. Vendor calls that leave India (LLM, possibly STT) carry transcript text only, never phone numbers or full addresses. Counsel confirms before pilot whether inference abroad needs anything further.

Consent: recorded per customer per restaurant with notice version, purposes, channel, language and timestamp. The notice text lives in the repository under version control, in three languages. A consent is required before any profile field beyond the phone number is stored. Voice consent is the spoken yes after the notice, captured as `channel = call` with the call id as evidence. Withdrawal is a one-tap action on the ordering page and a staff action in the dashboard.

Retention jobs (BullMQ, nightly): recordings deleted at 90 days; transcripts anonymised at 12 months (customer id removed, text kept for tuning); orders kept as long as tax law requires; OTPs 10 minutes; sessions per Section 3.

Erasure: `dsar_request` of kind `erasure` deletes the customer's profile, addresses, preferences, consent and call transcripts for that restaurant (or all restaurants if platform-wide), and replaces `customer_id` on orders with null while keeping the order for accounting. Completed within 7 days, logged in the audit log.

Access control: `owner` can do everything in the dashboard; `staff` cannot change settings or billing; `agent` sees assigned restaurants; `admin` sees all. Every write to customer data is in the audit log.

Secrets in environment variables only. Webhooks verify signatures. OTP endpoints rate-limited per phone and per IP. No PII in application logs; log `phone_hash` and ids.

Recordings: private bucket, signed URLs with 15-minute expiry, access logged.

Breach procedure: a written runbook in `docs/runbooks/breach.md` before pilot, naming who notifies the Data Protection Board and affected customers, and within what time.

---

## 11. Onboarding checklist (what the agent console tracks)

1. Restaurant and outlet created; owner phone verified.
2. Razorpay linked account submitted; status tracked until active.
3. Menu photographed, digitised, corrected, vocabulary generated and published.
4. Virtual number provisioned; Exotel flow built; forwarding set on the restaurant's number; failover to owner mobile verified by pulling the voice service offline once.
5. Hours, delivery radius, COD, handoff number configured.
6. Test order on each channel: AI call in each language, table page, delivery page with a code.
7. Card batch generated, printed, delivered and placed; placement audited at week 2.
8. UPI Autopay mandate created.
9. Two weeks of monitored calls: agent reviews every handoff and correction daily and adds vocabulary.
10. First weekly aggregator count entered.

---

## 12. Metrics instrumentation

Every Section 9 metric in the Ideation file maps to a SQL view over the tables above. Views live in `packages/db/views` and Metabase reads them from a replica.

| Metric | Definition in data |
|---|---|
| Direct Order Share (North Star) | Per outlet per month: ServeLine orders with status delivered or dine-in completed, divided by (those plus `external_order_count` for the same weeks). Report the median across active outlets |
| AI call completion rate | Calls with `intent = order`, `answered_by = ai`, `outcome = completed`, and the linked order has `correction_flag = false`, divided by calls with `intent = order` and `answered_by = ai` |
| Card redemption rate | `code_redemption` rows within 60 days of `card_batch.placed_at`, divided by the sum of aggregator orders in `external_order_count` over the same window, per batch |
| Profile capture rate | ServeLine-channel orders with `customer_id` not null, divided by all ServeLine-channel orders |
| Menu digitisation completion | Days from `restaurant.created_at` to first `menu.published_at` |
| Order error rate | Orders with `correction_flag` or `cancelled_reason = wrong_order`, divided by all orders |
| 30-day repeat rate | Customers with a second order within 30 days of their first, by first-order month cohort |
| Monthly direct order volume | Count of ServeLine-channel orders, per outlet and total |
| Cost per call | Average `call_cost.total_paise` over a trailing 7 days, per outlet; alert at ₹15, guardrail ₹20 |
| Churn | Restaurants moving to `churned` in a month divided by active at month start |
| Onboarding time | Checklist step 1 to step 6 complete |
| Complaint rate | Calls tagged `complaint` in review divided by AI-answered calls |

---

## 13. Billing and metering

Monthly job on the first of the month, per restaurant, for the previous calendar month:

Subscription ₹4,999. AI calls counted where `counts_toward_allowance` is true; overage at ₹5 per call beyond 500. Fee at 2% of `order.total_paise` for every ServeLine-channel order (`ai_call`, `page_table`, `page_delivery`) that reached `delivered` or completed dine-in in the period; cancelled orders are excluded. Written to `usage_ledger`, turned into an `invoice`, debited by mandate, with a payment link on failure and a dashboard banner after 3 days.

Trial: 30 days from `trial_started_at` or 150 allowance calls, whichever first. At the limit the restaurant sees a conversion screen; if not converted within 7 days, the Exotel flow is switched to dial the owner mobile directly and the ordering page stays live. Nothing is deleted.

---

## 14. Milestones and acceptance criteria

Estimates assume two people, or one person with Claude Code, working full time. Each milestone ends with a demo on a real phone.

### M0: foundations (week 1 to 2)

Monorepo, CI, environments (dev, staging, prod), Postgres and Redis in Mumbai, S3 buckets, auth by OTP, `restaurant`, `outlet`, `staff_user`, `platform_user`, menu tables and a seed script that loads a sample Bangalore menu in three languages. Vendor accounts opened: Exotel (number provisioned, streaming enabled), Sarvam, Razorpay (Route enabled), SMS DLT application filed.

Done when: a staff user can log in by OTP on staging; migrations run from zero; the seed menu renders in an API response; DLT application reference number is in `docs/vendors.md`.

### M1: orders without AI (week 3 to 5)

Ordering page in both contexts, dashboard live orders and actions, manual order entry, menu editor, card batch generation with PDFs, discount codes and redemptions, Razorpay linked account flow and payment links with webhooks, SMS confirmations (once DLT approves; stub provider until then), consent records, `external_order_count` entry.

Done when: a test restaurant takes a delivery order from a scanned card with the code applied, gets paid by UPI on a real phone into its own linked account, the dashboard shows it within 5 seconds and can advance it to delivered; a second redemption of the same code by the same phone is refused; a table-context order carries the table number; the Monday aggregator prompt appears and persists until answered.

### M2: voice v0 (week 6 to 9)

Voice service with the Exotel transport, Sarvam STT and TTS, LLM adapter with two providers, the tool set, session init and cart via the API, read-back, order placement, SMS payment link, transfer to human, carrier failover verified, recording capture, call and turn logging, cost ledger. Hindi and English only.

Done when: from a real mobile, a forwarded call to the test restaurant's display number is answered by the AI within 2 rings; a three-item order with a variant is placed in Hindi and appears on the dashboard with a payment link received by SMS; "I want to talk to someone" transfers to the handoff number; with the voice service stopped, the same call rings the owner mobile; p95 turn latency on 20 test calls is under 1.8 s; every call has a recording in S3 and a cost row.

### M3: voice v1 (week 10 to 12)

Kannada and code-mixed handling, repeat-order shortcut, enquiry answering and SMS deflection, hybrid address capture with the address link and `address_pending` state, serviceability check, duration cap, silence handling, confidence gating, abuse handling, `usual_order` refresh.

Done when: a Kannada order and a Hinglish order both complete on the scripted test set; a returning test customer completes an order in under 40 seconds via "same as last time"; an hours enquiry is answered in one turn and a second enquiry sends the page link; a new customer's rough address produces an `address_pending` order that confirms from the SMS link; a 7-minute call transfers at 6 minutes.

### M4: menu digitisation and the tuning loop (week 13 to 14)

Agent console: onboarding checklist, photo-to-menu extraction and editor, vocabulary generation and editing, vocabulary push or post-STT correction depending on Sarvam's answer, call review with tagging and in-place alias creation.

Done when: an agent turns three photos of a real menu into a published menu with vocabulary in under 45 minutes; a deliberately mispronounced item on a test call is misheard, tagged, aliased, and recognised on the next call.

### M5: compliance, billing and metrics (week 15 to 16)

Retention jobs, erasure workflow, audit log coverage, consent notices in three languages with versioning, breach runbook, usage ledger, invoices, UPI Autopay mandates, trial limits and conversion screen, Metabase views for every Section 12 metric, cost-per-call alerts, load test.

Done when: an erasure request removes a test customer everywhere except anonymised orders within one job run; a month-end job produces an invoice matching a hand calculation for a restaurant with 620 calls and ₹80,000 of channel orders (₹4,999 + ₹600 + ₹1,600); 10 concurrent calls to one outlet and 50 across the platform complete with p95 latency inside budget; every metric view returns numbers for the seeded data.

### M6: pilot readiness (week 17 to 18)

Three restaurants live in Bangalore, ops runbooks (voice outage, vendor outage, payment disputes, DPDP requests), on-call rota, agent daily review routine, weekly pilot report.

Done when: three real restaurants have taken real paid orders through both the call and the page for seven consecutive days; the pilot report shows Direct Order Share, completion rate and cost per call per restaurant; no P1 incident open.

---

## 15. Repository layout and the Claude Code brief

```
serveline/
  apps/web/                 Next.js: ordering page, dashboard, agent console, API route handlers
    app/(customer)/r/[slug]/
    app/(restaurant)/app/
    app/(platform)/agent/
    app/api/v1/
  services/voice/           Python, Pipecat pipeline, Exotel transport, vendor adapters
    serveline_voice/
      transports/exotel.py
      stt/sarvam.py  tts/sarvam.py  llm/adapter.py
      pipeline.py  tools.py  prompts/
    tests/
  packages/db/              Drizzle schema, migrations, SQL views, seed
  packages/shared/          TypeScript types, tool JSON Schemas, consent notice texts (hi, en, kn)
  docs/
    vendors.md              account ids, DLT reference, Exotel flow screenshots
    runbooks/               voice-outage.md, vendor-outage.md, payments.md, breach.md, dsar.md
    adr/                    one file per stack decision changed after this spec
  CLAUDE.md
  .env.example
```

CLAUDE.md, to write on day one, should say:

What this is: a link to the Ideation file and this spec, with the sentence "product decisions live in the Ideation file; if the behaviour you need is not decided there, stop and ask."

Conventions: TypeScript strict; money in paise; times in UTC; UK English in copy; consent notice texts are versioned and never edited in place; every customer-data write goes through a repository function that writes the audit log; no vendor call without its env var; no PII in logs.

Commands: `pnpm dev`, `pnpm db:migrate`, `pnpm db:seed`, `pnpm test`, `pnpm lint`; `uv run voice` and `uv run pytest` in `services/voice`.

Definition of done for a milestone: the acceptance criteria in Section 14 pass on staging, on a real phone where the criterion says so, and the demo is recorded.

Do not: create fake payments outside test mode; store phone numbers anywhere other than `customer`, `staff_user`, `platform_user` and `outlet`; put customer text into a prompt without stripping numbers; change the fee, allowance or trial rules in code without a matching change in the Ideation file.

Suggested first prompts, one per milestone, each pointing at the milestone's section here and its acceptance list.

Environment variables (`.env.example`): `DATABASE_URL`, `REDIS_URL`, `S3_BUCKET_RECORDINGS`, `S3_BUCKET_ASSETS`, `AWS_REGION=ap-south-1`, `EXOTEL_SID`, `EXOTEL_API_KEY`, `EXOTEL_API_TOKEN`, `EXOTEL_SUBDOMAIN`, `SARVAM_API_KEY`, `LLM_PRIMARY_PROVIDER`, `LLM_PRIMARY_API_KEY`, `LLM_SECONDARY_PROVIDER`, `LLM_SECONDARY_API_KEY`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `SMS_PROVIDER`, `SMS_API_KEY`, `DLT_ENTITY_ID`, `DLT_HEADER`, `VOICE_SERVICE_TOKEN`, `PHONE_HASH_PEPPER`, `JWT_SECRET`, `SENTRY_DSN`, `OTEL_EXPORTER_OTLP_ENDPOINT`.

---

## 16. Test strategy

Unit: cart and pricing, code redemption rules, order state transitions, billing calculation, consent gating, serviceability.

Contract: every voice tool against the API with recorded fixtures; the voice service's pinned contract version fails CI if the API changes it.

Voice evaluation harness (from M2, grows every milestone): a scripted utterance set per language, at least 200 utterances per outlet menu, recorded by five speakers over a real phone line with kitchen noise played in the background. Measures item recognition accuracy (the item that ends up in the cart is the item spoken), intent accuracy, and turn latency. Runs against staging on every voice change. Target item accuracy: 85% at M2, 92% at M3, 95% after vocabulary tuning at M4.

End to end: scripted calls through Exotel to a staging number for each flow in Ideation Section 8; payment in Razorpay test mode; SMS to a sink number.

Load: 10 concurrent calls to one outlet and 50 platform-wide, sustained 10 minutes; latency inside budget; no dropped audio.

Chaos: stop the voice service mid-day on staging; confirm Exotel dials the owner mobile within 3 seconds. Kill the LLM provider key; confirm the second provider takes over on the next turn.

Accessibility and device: the ordering page passes Lighthouse mobile performance above 85 on a throttled 3G profile and works on Android Chrome two major versions back.

---

## 17. Questions to settle at kickoff

1. Does Sarvam's current speech-to-text model accept a custom vocabulary or hotword list per session? Decides whether M4 pushes vocabulary or post-corrects.
2. Does Exotel support call transfer while an AgentStream session is active, and what is the per-minute streaming price in Bangalore? Decides the handoff design and the telephony cost line.
3. Razorpay Route KYC turnaround for a small restaurant with only a current account and FSSAI: 2 days or 2 weeks? Decides where linked-account onboarding sits in the agent visit.
4. DLT approval lead time for a new entity in September 2026. Decides whether M1 ships with a stubbed SMS provider.
5. Counsel's view on LLM inference outside India on transcript text under the DPDP Rules, and on voice consent captured as a spoken yes after a notice.
6. Whether the pilot restaurants' numbers are on carriers that allow unconditional forwarding to a virtual number without a business plan change (Jio, Airtel and Vi differ).
