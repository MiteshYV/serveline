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
