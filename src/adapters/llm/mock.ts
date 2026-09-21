import { formatINR, paise } from '../../core/money.ts'
import type { LlmAdapter, LlmMessage, LlmRequest, LlmResponse, ToolCall } from './index.ts'

/**
 * The scripted model (M2 design §"Adapters"): deterministic rules over the last caller text and
 * the tool results so far, good enough to drive every acceptance conversation in the design with
 * no key. It is a policy, not a parser of English — when in doubt it searches the menu, which is
 * what the real model is told to do too (Build Spec §5.2 "menu search is a tool call, never free
 * recall").
 *
 * What it reads from the request:
 *   - `Language: hi|en|kn` anywhere in the system prompt → the reply language (English if absent).
 *   - `Usual order: 2 × Masala Dosa, 1 × Filter Coffee` in the system prompt → the "same as last
 *     time" shortcut: a yes with an empty cart searches each item and adds it with its quantity.
 *   - Tool results, tolerantly: a search hit is any object with `id`/`itemId` and `name` (variants
 *     as `{ id, name }[]`, option groups as `{ minSelect, options: [{ id }] }[]`); a cart is any
 *     object with an array of `{ itemName|name, qty, variantName? }` and a `totalPaise`.
 *
 * Usage counts words as tokens, so the cost ledger sees non-zero numbers in a demo.
 */
export const MOCK_MODEL = 'scripted-policy-1'

type Lang = 'hi' | 'en' | 'kn'

const T: Record<Lang, {
  askOrder: string
  added: (summary: string | null) => string
  notFound: string
  readBack: (summary: string) => string
  placed: string
  notPlaced: (reason: string) => string
  refused: (reason: string) => string
  codeApplied: string
  transferring: string
  bye: string
}> = {
  en: {
    askOrder: 'What would you like to order?',
    added: (s) => (s ? `Added. So far: ${s}. Anything else?` : 'Added. Anything else?'),
    notFound: "I couldn't find that on the menu. Anything else?",
    readBack: (s) => `Your order: ${s}. Shall I place it — pickup or delivery?`,
    placed: 'Your order is placed. The payment link is on its way by SMS. Thank you!',
    notPlaced: (r) => `Sorry, I could not place that: ${r}. Shall I make it pickup instead?`,
    refused: (r) => `Sorry, that did not work: ${r}.`,
    codeApplied: 'Code applied. Anything else?',
    transferring: 'Connecting you to the restaurant.',
    bye: 'Goodbye!',
  },
  hi: {
    askOrder: 'आप क्या ऑर्डर करना चाहेंगे?',
    added: (s) => (s ? `जोड़ दिया। अभी तक: ${s}। और कुछ?` : 'जोड़ दिया। और कुछ?'),
    notFound: 'यह मेनू में नहीं मिला। कुछ और?',
    readBack: (s) => `आपका ऑर्डर: ${s}। ऑर्डर लगा दूँ — पिकअप या डिलीवरी?`,
    placed: 'आपका ऑर्डर लग गया। पेमेंट लिंक SMS से आ रहा है। धन्यवाद!',
    notPlaced: (r) => `माफ़ कीजिए, ऑर्डर नहीं लग सका: ${r}। पिकअप कर दूँ?`,
    refused: (r) => `माफ़ कीजिए, यह नहीं हो सका: ${r}।`,
    codeApplied: 'कोड लग गया। और कुछ?',
    transferring: 'आपको रेस्टोरेंट से जोड़ रही हूँ।',
    bye: 'धन्यवाद, नमस्ते!',
  },
  kn: {
    askOrder: 'ನೀವು ಏನು ಆರ್ಡರ್ ಮಾಡಲು ಬಯಸುತ್ತೀರಿ?',
    added: (s) => (s ? `ಸೇರಿಸಲಾಗಿದೆ. ಇಲ್ಲಿಯವರೆಗೆ: ${s}. ಇನ್ನೇನಾದರೂ?` : 'ಸೇರಿಸಲಾಗಿದೆ. ಇನ್ನೇನಾದರೂ?'),
    notFound: 'ಅದು ಮೆನುವಿನಲ್ಲಿ ಸಿಗಲಿಲ್ಲ. ಬೇರೆ ಏನಾದರೂ?',
    readBack: (s) => `ನಿಮ್ಮ ಆರ್ಡರ್: ${s}. ಆರ್ಡರ್ ಮಾಡಲೇ — ಪಿಕಪ್ ಅಥವಾ ಡೆಲಿವರಿ?`,
    placed: 'ನಿಮ್ಮ ಆರ್ಡರ್ ಆಗಿದೆ. ಪಾವತಿ ಲಿಂಕ್ SMS ಮೂಲಕ ಬರುತ್ತಿದೆ. ಧನ್ಯವಾದಗಳು!',
    notPlaced: (r) => `ಕ್ಷಮಿಸಿ, ಆರ್ಡರ್ ಆಗಲಿಲ್ಲ: ${r}. ಪಿಕಪ್ ಮಾಡಲೇ?`,
    refused: (r) => `ಕ್ಷಮಿಸಿ, ಅದು ಆಗಲಿಲ್ಲ: ${r}.`,
    codeApplied: 'ಕೋಡ್ ಅನ್ವಯಿಸಲಾಗಿದೆ. ಇನ್ನೇನಾದರೂ?',
    transferring: 'ನಿಮ್ಮನ್ನು ರೆಸ್ಟೋರೆಂಟ್‌ಗೆ ಸಂಪರ್ಕಿಸುತ್ತಿದ್ದೇನೆ.',
    bye: 'ಧನ್ಯವಾದಗಳು, ನಮಸ್ಕಾರ!',
  },
}

// --- caller text --------------------------------------------------------------------------

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ek: 1, do: 2, teen: 3, char: 4, chaar: 4, paanch: 5, panch: 5, chhe: 6, che: 6, saat: 7, aath: 8, nau: 9,
  ondu: 1, eradu: 2, mooru: 3, naalku: 4, aidu: 5, aaru: 6, elu: 7, entu: 8, ombattu: 9,
}

/** What people say instead of the variant's menu name. */
const VARIANT_WORDS: Record<string, string> = { aadha: 'half', adha: 'half', poora: 'full', pura: 'full', bada: 'large', chhota: 'small' }

const FILLER = /\b(i want|i'd like|i would like|can i get|please|give me|order|and|a|an|the|some|chahiye|dena|de do|mujhe|ke liye|beku|kodi|aur|mattu)\b/g

const HUMAN = /\b(human|someone|person|manager|owner|staff|baat)\b/
const BYE = /\b(bye|goodbye|cancel|alvida|rehne do)\b/
const CONFIRM = /\b(yes|yeah|yep|haan|ha|bas|done|that's all|thats all|ok|okay|confirm|same|wahi|last time|houdu|haudu|sari|aayithu)\b/
const GREETING = /\b(hello|hi|hey|namaste|namaskar|namaskara|good (morning|afternoon|evening))\b/g
const HOURS = /\b(open|close|closing|hours|timing|timings|kab tak|kitne baje|samaya)\b/
const ADDRESS = /\b(where|address|located|location|kahan|kaha|elli)\b/
const MENU = /\b(menu|what do you have|kya kya hai|what's available|enu ide)\b/
const CODE = /\b(?=[a-z0-9]*[a-z])(?=[a-z0-9]*\d)[a-z0-9]{6,}\b/i

function qtyFrom(text: string): number {
  const digit = /\b([1-9])\b/.exec(text)
  if (digit?.[1]) return Number(digit[1])
  for (const word of text.toLowerCase().split(/\s+/)) {
    const n = NUMBER_WORDS[word]
    if (n) return n
  }
  return 1
}

/** "do masala dosa please" → "masala dosa": quantities and fillers are not menu words. */
function menuQuery(text: string): string {
  return text.toLowerCase()
    .replace(/\b[1-9]\b/g, ' ')
    .split(/\s+/).filter((w) => !(w in NUMBER_WORDS) && !(w in VARIANT_WORDS) && w !== 'half' && w !== 'full' && w !== 'large' && w !== 'regular' && w !== 'small')
    .join(' ')
    .replace(FILLER, ' ')
    .replace(/[^\p{L}\p{N} ]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function langOf(system: string): Lang {
  const m = /\bLanguage:\s*(hi|en|kn)\b/i.exec(system)
  return (m?.[1]?.toLowerCase() as Lang | undefined) ?? 'en'
}

/**
 * `Usual order: 2 × Masala Dosa, 1 × Filter Coffee` → [{ name, qty }]. Also accepts `x` and
 * `2 Masala Dosa`. The list ends at the first `;`: prompt.ts follows it with the price and the
 * guidance sentence on the same line, which are not items.
 */
export function usualOrderOf(system: string): { name: string; qty: number }[] {
  const line = /usual order[^:\n]*:\s*([^\n;]+)/i.exec(system)?.[1]
  if (!line) return []
  return line.split(/,|;|\band\b|\baur\b/).map((part) => {
    const p = part.trim().replace(/\.$/, '')
    const lead = /^(\d+)\s*[x×]?\s*(.+)$/.exec(p)
    if (lead?.[1] && lead[2]) return { qty: Number(lead[1]), name: lead[2].trim() }
    const trail = /^(.+?)\s*[x×]\s*(\d+)$/.exec(p)
    if (trail?.[1] && trail[2]) return { qty: Number(trail[2]), name: trail[1].trim() }
    return { qty: 1, name: p }
  }).filter((e) => e.name)
}

// --- tool results, read tolerantly ----------------------------------------------------------

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (o: Record<string, unknown>, ...keys: string[]): string | undefined => {
  for (const k of keys) if (typeof o[k] === 'string') return o[k] as string
  return undefined
}
const num = (o: Record<string, unknown>, ...keys: string[]): number | undefined => {
  for (const k of keys) if (typeof o[k] === 'number') return o[k] as number
  return undefined
}

type Outcome = { ok: boolean; data: unknown; reason: string }

function outcome(result: unknown): Outcome {
  if (isObj(result) && 'ok' in result) {
    return { ok: result.ok === true, data: result.data, reason: str(result, 'reason') ?? 'refused' }
  }
  return { ok: true, data: result, reason: '' }
}

/** The first array of objects at the top of `data` or one key down (`items`, `lines`, `results`…). */
function firstArray(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) return data.filter(isObj)
  if (isObj(data)) {
    for (const v of Object.values(data)) if (Array.isArray(v) && v.some(isObj)) return v.filter(isObj)
  }
  return []
}

function cartSummary(data: unknown): string | null {
  const lines = firstArray(data)
    .map((l) => ({ name: str(l, 'itemName', 'name'), qty: num(l, 'qty') ?? 1, variant: str(l, 'variantName', 'variant') }))
    .filter((l): l is { name: string; qty: number; variant: string | undefined } => l.name !== undefined)
  if (lines.length === 0) return null
  const items = lines.map((l) => `${l.qty} × ${l.name}${l.variant ? ` (${l.variant})` : ''}`).join(', ')
  const total = isObj(data) ? num(data, 'totalPaise') : undefined
  return total === undefined ? items : `${items} — ${formatINR(paise(total))}`
}

/** add_to_cart args for the first search hit, with the variant the caller named and any mandatory option. */
function addArgsFor(hit: Record<string, unknown>, text: string, qty: number): Record<string, unknown> | null {
  const itemId = str(hit, 'id', 'itemId', 'item_id')
  if (!itemId) return null
  const args: Record<string, unknown> = { item_id: itemId, qty }

  const words = text.toLowerCase().split(/\s+/).map((w) => VARIANT_WORDS[w] ?? w)
  const variant = firstArray(hit.variants).find((v) => {
    const name = str(v, 'name')?.toLowerCase()
    return name !== undefined && words.includes(name)
  })
  const variantId = variant && str(variant, 'id')
  if (variantId) args.variant_id = variantId

  const optionIds = firstArray(hit.optionGroups)
    .filter((g) => (num(g, 'minSelect') ?? 0) > 0)
    .map((g) => firstArray(g.options)[0])
    .map((o) => o && str(o, 'id'))
    .filter((id): id is string => typeof id === 'string')
  if (optionIds.length > 0) args.option_ids = optionIds

  return args
}

// --- the policy ---------------------------------------------------------------------------------

type Decision = { text?: string; calls?: { name: string; args: Record<string, unknown> }[] }

/** A cart is open once add_to_cart has succeeded and no place_order has since. */
function cartOpen(messages: LlmMessage[]): boolean {
  let open = false
  for (const m of messages) {
    if (m.role !== 'tool') continue
    for (const r of m.results) {
      if (r.name === 'add_to_cart' && outcome(r.result).ok) open = true
      if (r.name === 'place_order' && outcome(r.result).ok) open = false
    }
  }
  return open
}

function onCallerText(text: string, system: string, hasCart: boolean, t: (typeof T)[Lang], lang: Lang): Decision {
  const lower = text.toLowerCase()

  if (HUMAN.test(lower)) return { calls: [{ name: 'transfer_to_human', args: { reason: 'customer_request' } }] }
  if (BYE.test(lower)) {
    return { calls: [{ name: 'end_call', args: { reason: /cancel/.test(lower) ? 'customer_cancelled' : 'customer_done' } }] }
  }
  const code = CODE.exec(text)?.[0]
  if (code) return { calls: [{ name: 'apply_code', args: { code: code.toUpperCase() } }] }

  if (hasCart) {
    if (/\bdeliver/.test(lower)) return { calls: [{ name: 'place_order', args: { fulfilment: 'delivery', payment_method: 'upi_link' } }] }
    if (/\b(pickup|pick up|pick-up|takeaway|le jaunga|le jaungi)\b/.test(lower)) {
      return { calls: [{ name: 'place_order', args: { fulfilment: 'pickup', payment_method: 'upi_link' } }] }
    }
    if (CONFIRM.test(lower)) return { calls: [{ name: 'get_cart', args: {} }] }
  } else if (CONFIRM.test(lower)) {
    // Build Spec §5.2: "same as last time?" — a yes with nothing in the cart means the usual order.
    const usual = usualOrderOf(system)
    if (usual.length > 0) return { calls: usual.map((u) => ({ name: 'search_menu', args: { query: u.name, language: lang } })) }
    return { text: t.askOrder }
  }

  if (HOURS.test(lower)) return { calls: [{ name: 'answer_enquiry', args: { kind: 'hours' } }] }
  if (ADDRESS.test(lower)) return { calls: [{ name: 'answer_enquiry', args: { kind: 'address' } }] }
  if (!hasCart && /\bdeliver/.test(lower)) return { calls: [{ name: 'answer_enquiry', args: { kind: 'delivery' } }] }
  if (MENU.test(lower)) return { calls: [{ name: 'answer_enquiry', args: { kind: 'menu' } }] }

  const query = menuQuery(lower.replace(GREETING, ' '))
  if (!query) return { text: t.askOrder }
  return { calls: [{ name: 'search_menu', args: { query, language: lang } }] }
}

function onToolResults(
  results: { id: string; name: string; result: unknown }[],
  messages: LlmMessage[],
  text: string,
  system: string,
  t: (typeof T)[Lang],
): Decision {
  const by = (name: string) => results.filter((r) => r.name === name)

  const searches = by('search_menu')
  if (searches.length > 0) {
    // The search args live on the assistant message that asked; a usual-order search carries
    // that item's quantity, an ordinary one the quantity the caller just said.
    const asked = [...messages].reverse().find((m) => m.role === 'assistant')
    const argsById = new Map(asked?.role === 'assistant' ? asked.toolCalls.map((c) => [c.id, c.args]) : [])
    const usual = usualOrderOf(system)
    const calls: Decision['calls'] = []
    for (const s of searches) {
      const hit = firstArray(outcome(s.result).data)[0]
      if (!hit) continue
      const query = argsById.get(s.id)?.query
      const fromUsual = usual.find((u) => u.name.toLowerCase() === String(query ?? '').toLowerCase())
      const args = addArgsFor(hit, text, fromUsual?.qty ?? qtyFrom(text))
      if (args) calls.push({ name: 'add_to_cart', args })
    }
    return calls.length > 0 ? { calls } : { text: t.notFound }
  }

  const adds = by('add_to_cart')
  if (adds.length > 0) {
    const failed = adds.map((a) => outcome(a.result)).find((o) => !o.ok)
    if (failed) return { text: t.refused(failed.reason.replaceAll('_', ' ')) }
    const last = adds.at(-1)
    return { text: t.added(cartSummary(outcome(last?.result).data)) }
  }

  const single = results[0]
  if (!single) return { text: t.askOrder }
  const o = outcome(single.result)
  const reason = o.reason.replaceAll('_', ' ')
  switch (single.name) {
    case 'get_cart':
      return { text: cartSummary(o.data) ? t.readBack(cartSummary(o.data) as string) : t.askOrder }
    case 'place_order':
      return { text: o.ok ? t.placed : t.notPlaced(reason) }
    case 'apply_code':
      return { text: o.ok ? t.codeApplied : t.refused(reason) }
    case 'transfer_to_human':
      return { text: t.transferring }
    case 'end_call':
      return { text: t.bye }
    case 'answer_enquiry': {
      const spoken = typeof o.data === 'string' ? o.data : isObj(o.data) ? str(o.data, 'text', 'answer') : undefined
      return { text: spoken ?? (o.ok ? JSON.stringify(o.data) : t.refused(reason)) }
    }
    default:
      return { text: o.ok ? t.askOrder : t.refused(reason) }
  }
}

const words = (s: string): number => s.split(/\s+/).filter(Boolean).length

/** Pure: the whole policy over one request. Exported so the tests can drive it without the adapter. */
export function decide(req: LlmRequest): LlmResponse {
  const lang = langOf(req.system)
  const t = T[lang]
  const last = req.messages.at(-1)
  const lastUser = [...req.messages].reverse().find((m) => m.role === 'user')
  const text = lastUser?.role === 'user' ? lastUser.text : ''

  const decision = last?.role === 'tool'
    ? onToolResults(last.results, req.messages, text, req.system, t)
    : onCallerText(text, req.system, cartOpen(req.messages), t, lang)

  const toolCalls: ToolCall[] = (decision.calls ?? []).map((c, i) => ({ id: `mock-${req.messages.length}-${i}`, ...c }))
  const reply = decision.text ?? null

  const tokensIn = words(req.system) + req.messages.reduce((n, m) => n + words(m.role === 'user' ? m.text : JSON.stringify(m)), 0)
  const tokensOut = words(reply ?? '') + words(JSON.stringify(toolCalls))
  return { text: reply, toolCalls, usage: { tokensIn, tokensOut }, provider: 'mock', model: MOCK_MODEL }
}

export const mockLlmAdapter: LlmAdapter = {
  provider: 'mock',
  model: MOCK_MODEL,
  complete: async (req) => decide(req),
}
