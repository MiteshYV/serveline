import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { NOTICE_VERSION } from '../core/consent.ts'
import type { Lang } from './i18n.ts'
import { markdownToHtml } from './markdown.ts'

/**
 * The consent notice in force, as HTML for the checkout's consent step (Build Spec §10: "the
 * versioned notice in the customer's chosen language"). Read from contracts/notices/{version}/
 * so the words a customer sees are exactly the words `consent_record.notice_version` points at.
 *
 * Server only (node:fs). `{{restaurant_name}}` is the notice's single placeholder
 * (contracts/notices/README.md); substituted before conversion, so the name is escaped with
 * everything else.
 */
export function noticeHtml(lang: Lang, restaurantName: string): string {
  // From the project root, not import.meta.url: under the bundler that URL points into .next/,
  // and contracts/ is deliberately outside the bundle so the Python voice service reads the same files.
  const path = join(process.cwd(), 'contracts', 'notices', NOTICE_VERSION, `${lang}.md`)
  return markdownToHtml(readFileSync(path, 'utf8').replaceAll('{{restaurant_name}}', restaurantName))
}
