/**
 * DPDP consent gating. Ideation §15, Build Spec §10.
 *
 * Consent is per customer per restaurant, and nothing crosses restaurants without a new one
 * (Build Spec §4). This module answers one question — may we do X with this person's data —
 * and it answers it the same way for the ordering page, the dashboard and, at M2, the call.
 */

/**
 * The notice in force today. Notice texts are versioned and never edited in place (CLAUDE.md),
 * so a wording change is a new value here plus new text files, never an edit to the old ones.
 * That is what makes the version check below meaningful: a stored `v1` really does mean the
 * customer read the v1 words.
 */
export const NOTICE_VERSION = 'v1'

/**
 * Exactly the purpose keys the notice texts declare in their frontmatter
 * (contracts/notices/v1/*.md). Nothing else may appear here: a purpose no notice describes is
 * one no customer has been told about, and consent to it would be unlawful. `call_recording`
 * is what the voice consent gate checks at M2 (Build Spec §10).
 */
export type ConsentPurpose =
  | 'order_fulfilment'
  | 'order_history'
  | 'personalisation'
  | 'call_recording'

/**
 * What each notice version actually told the customer. Core cannot read the notice files
 * (it has no filesystem access by design), so this is a literal, and consent.test.ts asserts it
 * matches the frontmatter so the two cannot drift.
 *
 * This is the half of the check that stops a stray value in `consent_record.purposes` — a
 * staff-entry path, a route bug, a v2 purpose written onto a v1 record — from authorising a
 * write the signed notice never covered. An unknown version is not in this map and fails closed.
 */
export const NOTICE_PURPOSES: Readonly<Record<string, readonly ConsentPurpose[]>> = {
  v1: ['order_fulfilment', 'order_history', 'personalisation', 'call_recording'],
}

/** The `consent_record` fields the gate reads. Build Spec §4. */
export type ConsentRecordView = {
  noticeVersion: string
  /**
   * `purposes` is a text[] column, so it arrives as plain strings. Typing it as ConsentPurpose[]
   * would assert something the database does not enforce; left as strings, a stray value simply
   * never matches, which fails closed.
   */
  purposes: readonly string[]
  withdrawnAt: Date | null
}

export function hasValidConsent(
  record: ConsentRecordView | undefined,
  purpose: ConsentPurpose,
  requiredVersion: string = NOTICE_VERSION,
): boolean {
  if (!record) return false
  // Withdrawal is one tap on the ordering page (Build Spec §10) and takes effect immediately.
  if (record.withdrawnAt) return false
  // Any mismatch, not merely an older one. Versions are not ordered and never rewritten, so
  // "not the notice we are asking about" is the whole test.
  if (record.noticeVersion !== requiredVersion) return false
  // Both halves: the notice they signed must have described this purpose, AND they must have
  // ticked it. The record alone is not enough — see NOTICE_PURPOSES.
  if (!NOTICE_PURPOSES[record.noticeVersion]?.includes(purpose)) return false
  return record.purposes.includes(purpose)
}

/**
 * Build Spec §10: "A consent is required before any profile field beyond the phone number is
 * stored." This function is that sentence made executable.
 *
 * It is a legal boundary, not a validation nicety. The phone number alone is what taking an
 * order needs; a name, an address, a dietary note or an order history written without a live
 * consent covering its purpose is a DPDP breach, and the Rules carry penalties to ₹250 crore
 * (Ideation §15). Do not route around it to make a form easier.
 *
 * It throws rather than returning a result because arriving here without consent is a programmer
 * error — the route was meant to gate the write long before this point, and the customer was
 * meant to be asked at the consent checkbox, not refused at the database. Loud in development is
 * the cheap place to find that.
 */
export function assertConsentForProfileWrite(
  record: ConsentRecordView | undefined,
  purpose: ConsentPurpose,
): void {
  if (hasValidConsent(record, purpose)) return
  // No customer identifiers in the message: it ends up in a log, and CLAUDE.md allows ids and
  // phone_hash there, nothing else.
  throw new Error(
    `No valid consent for purpose "${purpose}" against notice ${NOTICE_VERSION}: `
    + 'refusing to store a profile field beyond the phone number.',
  )
}
