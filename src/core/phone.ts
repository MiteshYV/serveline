import { createHash } from 'node:crypto'

/**
 * Build Spec §4: phone numbers are stored in E.164, with a `phone_hash` (SHA-256 with a server
 * pepper) alongside for the analytics and joins that do not need the number itself.
 *
 * The pepper is an argument rather than a `process.env` read, so this module stays free of the
 * environment and a test can hash without one being set. Reading the variable, and failing when it
 * is missing, is the caller's job (CLAUDE.md: a missing variable is an error, never a fallback).
 */

/** Indian mobile numbers are ten digits beginning 6 to 9. */
const MOBILE = /^[6-9]\d{9}$/

/**
 * Accepts what a customer actually types on the ordering page — "9876543210", "+919876543210",
 * "09876543210", "91 98765 43210", with spaces or hyphens — and returns E.164.
 *
 * Known ambiguity: a metro landline written with its trunk prefix is also eleven digits, so
 * "080 2345 6789" normalises as though it were a mobile. Nothing distinguishes the two without a
 * numbering-plan lookup, and the consequence is an OTP that never arrives, which the ordering page
 * already has a screen for.
 *
 * Errors never quote the input: they reach the logs, and CLAUDE.md allows no PII there.
 */
export const normalisePhone = (input: string): string => {
  const trimmed = input.trim().replace(/[\s-]/g, '')
  const digits = trimmed.startsWith('+') ? trimmed.slice(1) : trimmed
  if (!/^\d+$/.test(digits)) {
    throw new Error('Phone number must contain only digits, spaces, hyphens and a leading +')
  }

  let local = digits
  if (local.length === 12 && local.startsWith('91')) local = local.slice(2)
  else if (local.length === 11 && local.startsWith('0')) local = local.slice(1)

  if (!MOBILE.test(local)) {
    throw new Error('Not an Indian mobile number: expected ten digits beginning 6 to 9')
  }
  return `+91${local}`
}

/**
 * The hash recipe is frozen. Changing the pepper or the concatenation invalidates every stored
 * `phone_hash` in the estate, and the win-back rule (one redemption per phone per restaurant,
 * Build Spec §6) is enforced on those hashes.
 */
export const hashPhone = (e164: string, pepper: string): string => {
  if (pepper === '') {
    throw new Error('Phone hashing requires a server pepper; an empty one is a misconfiguration')
  }
  return createHash('sha256').update(pepper + e164).digest('hex')
}
