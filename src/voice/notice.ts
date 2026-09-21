import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { NOTICE_VERSION, type ConsentPurpose } from '../core/consent.ts'
import type { Lang } from '../ui/i18n.ts'

/**
 * The spoken rendering of the notice in force (contracts/notices/{version}/spoken-{lang}.md) —
 * what the assistant reads aloud before taking an order from a caller it has not met. Build Spec
 * §10: "Voice consent is the spoken yes after the notice, captured as channel = call with the
 * call id as evidence."
 *
 * The same version as the read notice, so a `consent_record` pointing at `v1` is honest either
 * way; fewer purposes, because the spoken words describe fewer (contracts/notices/README.md).
 */
export const SPOKEN_PURPOSES: readonly ConsentPurpose[] = ['order_fulfilment', 'order_history']

export function spokenNotice(lang: Lang, restaurantName: string): string {
  // From the project root, like src/ui/notice.ts: contracts/ is outside the bundle on purpose.
  const path = join(process.cwd(), 'contracts', 'notices', NOTICE_VERSION, `spoken-${lang}.md`)
  const raw = readFileSync(path, 'utf8')
  // Frontmatter is for the reader, not the caller: everything after the closing `---`.
  const body = raw.split(/^---$/m).slice(2).join('---').trim()
  return body.replaceAll('{{restaurant_name}}', restaurantName).replace(/\s*\n\s*/g, ' ')
}

const squash = (t: string) => t.replace(/\s+/g, ' ').trim()

/**
 * Was the notice actually read out, word for word, in this reply?
 *
 * The gate on `place_order` guarantees consent is *recorded*; on its own it does not guarantee the
 * caller ever heard what they were agreeing to, because reading the notice is the prompt's
 * instruction and a model may skip an instruction. Consent recorded without the notice is not
 * consent. So `record_consent` refuses until this returns true — the same shape as menu grounding
 * (Build Spec §5.3): the tool refuses what the model did not earn.
 *
 * Checked in segments around the restaurant's name, so the name itself is not what is matched, and
 * every clause of the notice has to be present. Short segments are ignored: punctuation between
 * two mentions of the name carries no meaning to test.
 */
export function noticeWasRead(reply: string, lang: Lang, restaurantName: string): boolean {
  const spoken = squash(spokenNotice(lang, restaurantName))
  const segments = spoken.split(restaurantName).map(squash).filter((part) => part.length > 15)
  if (segments.length === 0) return false
  const said = squash(reply)
  return segments.every((part) => said.includes(part))
}
