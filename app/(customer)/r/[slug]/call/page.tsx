import type { Metadata } from 'next'
import { stt } from '@/adapters/stt/index.ts'
import { getSession } from '@/auth/session.ts'
import { hasValidConsent } from '@/core/consent.ts'
import { getConsent, getCustomer } from '@/db/repos/index.ts'
import { Button } from '@/ui/Button.tsx'
import { t, type Lang } from '@/ui/i18n.ts'
import { currentLang, loadRestaurant } from '../lib.ts'
import { CallClient } from './CallClient.tsx'
import styles from './call.module.css'

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [{ restaurant }, lang] = await Promise.all([loadRestaurant((await params).slug), currentLang()])
  return { title: `${t('menu.callToOrder', lang)} · ${restaurant.name}` }
}

// Interim Hindi and Kannada, not native-reviewed (the src/ui/i18n.ts caveat).
const GATE: Record<'signIn' | 'consent', Record<Lang, string>> = {
  signIn: {
    en: 'Confirm your mobile number on the checkout first, then come back here to call.',
    hi: 'पहले चेकआउट पर अपना मोबाइल नंबर पक्का करें, फिर कॉल करने के लिए यहाँ वापस आएँ।',
    kn: 'ಮೊದಲು ಚೆಕ್‌ಔಟ್‌ನಲ್ಲಿ ನಿಮ್ಮ ಮೊಬೈಲ್ ಸಂಖ್ಯೆ ಖಚಿತಪಡಿಸಿ, ನಂತರ ಕರೆ ಮಾಡಲು ಇಲ್ಲಿಗೆ ಹಿಂತಿರುಗಿ.',
  },
  consent: {
    en: 'Agree to the notice on the checkout first, then come back here to call.',
    hi: 'पहले चेकआउट पर सूचना से सहमति दें, फिर कॉल करने के लिए यहाँ वापस आएँ।',
    kn: 'ಮೊದಲು ಚೆಕ್‌ಔಟ್‌ನಲ್ಲಿ ಸೂಚನೆಗೆ ಒಪ್ಪಿಗೆ ನೀಡಿ, ನಂತರ ಕರೆ ಮಾಡಲು ಇಲ್ಲಿಗೆ ಹಿಂತಿರುಗಿ.',
  },
}

/**
 * Whether `/listen` will answer with the mock recogniser, asked of the adapter itself rather than
 * read off VENDOR_MODE, so the two cannot drift: `STT_PROVIDER` overrides the mode, and only the
 * selection in src/adapters/stt/index.ts knows the answer. It is server-side — `vendorMode()` and
 * the provider clients read `process.env` — so the answer travels to CallClient as a boolean and
 * no server module is imported into a client component.
 *
 * It matters to the browser because a mock recogniser has bytes and no way to know what is on
 * them: under the mock the page must hand over the words its own `SpeechRecognition` heard, and
 * the route accepts that field from nobody else.
 *
 * `stt()` throws where a live mode names no provider. That is the listen route's problem to
 * report, not this page's — a caller who can still type should not be shown a crash — so the
 * throw is read here as "not the mock", which is true.
 */
function usesMockStt(): boolean {
  try {
    return stt().provider === 'mock'
  } catch {
    return false
  }
}

/**
 * `/r/{slug}/call` — the mic surface (M2 design "Surfaces"). A call is a customer's own: the
 * session cookie is what the voice routes authenticate by, so a caller without one is sent
 * through the checkout's phone → OTP → consent steps and back. Consent is gated here too:
 * `place_order` refuses `consent_required` and nothing in a call can grant it (Build Spec §10's
 * spoken yes waits for the telephone transport), so without it the call could only dead-end.
 */
export default async function CallPage({ params }: Props) {
  const { slug } = await params
  const [{ restaurant }, lang, session] = await Promise.all([loadRestaurant(slug), currentLang(), getSession('customer')])
  const customer = session ? await getCustomer(session.subjectId) : null

  let gate: keyof typeof GATE | null = customer ? null : 'signIn'
  if (customer) {
    const consent = await getConsent(customer.id, restaurant.id)
    const view = consent ? { noticeVersion: consent.noticeVersion, purposes: consent.purposes, withdrawnAt: consent.withdrawnAt } : undefined
    if (!hasValidConsent(view, 'order_fulfilment')) gate = 'consent'
  }

  if (gate) {
    // The checkout's actions are not reusable here: every one of them returns to the checkout
    // itself (`where()` in checkout/actions.ts). `return` names this page for the day that helper
    // honours it — one line there, not in this route.
    const href = `/r/${slug}/checkout?return=${encodeURIComponent(`/r/${slug}/call`)}`
    return (
      <div className={styles.call}>
        <h2 className={styles.title}>{t('menu.callToOrder', lang)}</h2>
        <p className={styles.lead}>{GATE[gate][lang]}</p>
        <Button href={href} variant="brand" size="counter" block>
          {gate === 'signIn' ? t('login.title', lang) : t('checkout.continue', lang)}
        </Button>
      </div>
    )
  }

  return <CallClient slug={slug} restaurant={restaurant.name} lang={lang} mockStt={usesMockStt()} />
}
