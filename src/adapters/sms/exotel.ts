import type { SmsAdapter } from './index.ts'

// .env.example's SMS block. Exotel is the primary provider, MSG91 the fallback (Build Spec §3).
const REQUIRED_ENV = ['SMS_PROVIDER', 'SMS_API_KEY', 'DLT_ENTITY_ID', 'DLT_HEADER'] as const

/**
 * Stub. No SMS account and no DLT approval exist (M1 design §"Build mode"), so `VENDOR_MODE=live`
 * fails loudly here rather than quietly falling back to the mock (CLAUDE.md).
 *
 * ponytail: when the account arrives this becomes one POST to Exotel's SMS API carrying the DLT
 * entity id, the registered header and the template id from templates.ts, returning the provider
 * SID. The templates file swaps to the registered wording at the same time.
 */
export function exotelSms(): SmsAdapter {
  const missing = REQUIRED_ENV.filter((name) => !process.env[name])
  if (missing.length > 0) throw new Error(`not configured: ${missing.join(', ')}`)
  throw new Error('not implemented: the Exotel SMS client is a stub until an account and DLT approval exist')
}
