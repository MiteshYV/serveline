import { isIP } from 'node:net'

/**
 * The rate-limit bucket key for a request's network address (Build Spec §10: "OTP endpoints
 * rate-limited per phone and per IP").
 *
 * Finding otp-per-ip-limit-keyed-on-client-supplied-header: `X-Forwarded-For` is a list the
 * *client* starts and each proxy appends to, so `[0]` — what every call site used to take — is
 * whatever the caller typed. A caller that varies one header then chooses its own bucket and the
 * ceiling never binds. Only the elements a proxy we control appended are worth anything, and only
 * the deployment knows how many of those there are, hence `TRUSTED_PROXY_HOPS`.
 *
 * What this limit is and is not worth, plainly:
 *  - With `TRUSTED_PROXY_HOPS >= 1` the key is the address the nearest trusted proxy observed. A
 *    caller cannot reach it, so the 60-per-10-minutes ceiling really does bind per address.
 *  - With 0 — no proxy — the only value Next ever writes is the socket address, but a caller that
 *    sends its own single-element header is indistinguishable from that. The ceiling is then a
 *    courtesy against accident, not a control against an attacker. Production must sit behind a
 *    known proxy with the hop count set.
 *  - Either way the *per-phone* ceiling (five per ten minutes, `otp.ts`) is the control that
 *    actually stops a brute force or an SMS bill run against one number, and it is unaffected.
 *  - And the limiter is one in-process Map (`rate-limit.ts`), so any per-IP ceiling is per
 *    instance until Redis lands at M2.
 */

/** The shared bucket for a request whose address cannot be trusted. Failing closed, not open. */
export const UNKNOWN_IP = 'unknown'

function trustedHops(): number {
  const n = Number(process.env.TRUSTED_PROXY_HOPS ?? '0')
  return Number.isInteger(n) && n >= 0 ? n : 0
}

/**
 * Never returns undefined: an address that cannot be derived falls into one shared bucket, so a
 * spoofed or absent header still meets a ceiling instead of skipping the check.
 */
export function clientIpKey(forwardedFor: string | null | undefined, hops: number = trustedHops()): string {
  const list = (forwardedFor ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  if (list.length === 0) return UNKNOWN_IP

  // Counting from the end is the point: the last element was appended by the nearest proxy, the
  // one before it by the proxy before that. Anything the caller wrote stays at the front.
  // With no trusted proxy, accept the value only when it is the lone element Next fills in from
  // the socket — a longer list was shaped by the caller.
  const candidate = hops === 0 ? (list.length === 1 ? list[0] : undefined) : list.at(-hops)
  return candidate !== undefined && isIP(candidate) !== 0 ? candidate : UNKNOWN_IP
}
