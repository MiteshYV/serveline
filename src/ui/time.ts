/**
 * Duration formatting for the order card's elapsed timer ("04:12", design §7.1) and the OTP
 * resend countdown ("Resend in 0:24", design §7.6). Pure, so it can be tested without a DOM.
 */
export function formatDuration(ms: number, { padMinutes = true }: { padMinutes?: boolean } = {}): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const mm = padMinutes || h > 0 ? String(m).padStart(2, '0') : String(m)
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}
