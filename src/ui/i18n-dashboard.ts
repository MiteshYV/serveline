/**
 * Strings the counter operator reads on the dashboard and nowhere else. Kept out of `i18n.ts`
 * on purpose: that dictionary ships inside every client component that calls `t()`, including
 * the ordering page's cart, stepper and OTP field, and the ordering page has a hard 100 KB JS
 * budget (Build Spec §6). Nothing here is needed there.
 *
 * Hindi and Kannada are interim, not native-reviewed (ADR 0002 §4).
 *
 * ponytail: the owner's admin pages — settings, cards, /today, billing, the item editor — are
 * English only at M1. The operator surfaces (login, board, order detail, manual entry, sold-out
 * toggles) are the ones read at arm's length mid-shift and follow the language selector. The
 * upgrade is a second dictionary for the admin pages once a pilot owner asks for one.
 */

import type { Lang } from './i18n.ts'

const DICT = {
  // ---- login ----
  'login.counter': { en: 'Counter sign-in', hi: 'काउंटर साइन-इन', kn: 'ಕೌಂಟರ್ ಸೈನ್-ಇನ್' },
  'login.noAccount': {
    en: 'No staff account for this number. Ask the owner to add you.',
    hi: 'इस नंबर का कोई स्टाफ़ खाता नहीं है। मालिक से जोड़ने को कहें।',
    kn: 'ಈ ಸಂಖ್ಯೆಗೆ ಸಿಬ್ಬಂದಿ ಖಾತೆ ಇಲ್ಲ. ಸೇರಿಸಲು ಮಾಲೀಕರನ್ನು ಕೇಳಿ.',
  },
  'login.rateLimited': {
    en: 'Too many attempts. Wait a few minutes and try again.',
    hi: 'बहुत बार कोशिश हो गई। कुछ मिनट रुककर फिर कोशिश करें।',
    kn: 'ಹಲವು ಬಾರಿ ಪ್ರಯತ್ನಿಸಲಾಗಿದೆ. ಕೆಲವು ನಿಮಿಷ ಕಾದು ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.',
  },
  'login.devCode': { en: 'Demo mode — your code is {code}', hi: 'डेमो मोड — आपका कोड {code} है', kn: 'ಡೆಮೊ ಮೋಡ್ — ನಿಮ್ಮ ಕೋಡ್ {code}' },
  'login.changeNumber': { en: 'Change number', hi: 'नंबर बदलें', kn: 'ಸಂಖ್ಯೆ ಬದಲಿಸಿ' },
  'login.signOut': { en: 'Sign out', hi: 'साइन आउट', kn: 'ಸೈನ್ ಔಟ್' },

  // ---- shell navigation ----
  'nav.board': { en: 'Board', hi: 'बोर्ड', kn: 'ಬೋರ್ಡ್' },
  'nav.newOrder': { en: 'New order', hi: 'नया ऑर्डर', kn: 'ಹೊಸ ಆರ್ಡರ್' },
  'nav.menu': { en: 'Menu', hi: 'मेन्यू', kn: 'ಮೆನು' },
  'nav.cards': { en: 'Cards', hi: 'कार्ड', kn: 'ಕಾರ್ಡ್‌ಗಳು' },
  'nav.today': { en: 'Today', hi: 'आज', kn: 'ಇಂದು' },
  'nav.settings': { en: 'Settings', hi: 'सेटिंग', kn: 'ಸೆಟ್ಟಿಂಗ್‌ಗಳು' },
  'nav.billing': { en: 'Billing', hi: 'बिलिंग', kn: 'ಬಿಲ್ಲಿಂಗ್' },

  // ---- board ----
  'board.seen': { en: 'Seen', hi: 'देख लिया', kn: 'ನೋಡಿದೆ' },
  'board.soundOn': { en: 'Order sounds on', hi: 'ऑर्डर की आवाज़ चालू', kn: 'ಆರ್ಡರ್ ಶಬ್ದ ಆನ್' },
  'board.soundOff': { en: 'Turn sounds off', hi: 'आवाज़ बंद करें', kn: 'ಶಬ್ದ ಆಫ್ ಮಾಡಿ' },
  'board.doneToday': { en: 'Done today', hi: 'आज पूरे हुए', kn: 'ಇಂದು ಮುಗಿದವು' },
  'board.details': { en: 'Open order', hi: 'ऑर्डर खोलें', kn: 'ಆರ್ಡರ್ ತೆರೆಯಿರಿ' },
  'board.markCorrected': { en: 'Mark corrected', hi: 'सुधारा गया', kn: 'ಸರಿಪಡಿಸಲಾಗಿದೆ' },
  'board.resendLink': { en: 'Resend payment link', hi: 'भुगतान लिंक फिर भेजें', kn: 'ಪಾವತಿ ಲಿಂಕ್ ಮತ್ತೆ ಕಳುಹಿಸಿ' },
  'board.convertCod': { en: 'Convert to cash on delivery', hi: 'डिलीवरी पर नकद में बदलें', kn: 'ಡೆಲಿವರಿ ವೇಳೆ ನಗದಿಗೆ ಬದಲಿಸಿ' },
  'board.stateChanged': { en: 'Order {n} is now {state}', hi: 'ऑर्डर {n} अब {state}', kn: 'ಆರ್ಡರ್ {n} ಈಗ {state}' },
  'board.tableQr': { en: 'Table QR to print', hi: 'प्रिंट के लिए टेबल QR', kn: 'ಮುದ್ರಿಸಲು ಟೇಬಲ್ QR' },

  // ---- order detail ----
  'detail.timeline': { en: 'Timeline', hi: 'समयरेखा', kn: 'ಕಾಲರೇಖೆ' },
  'detail.payment': { en: 'Payment', hi: 'भुगतान', kn: 'ಪಾವತಿ' },
  'detail.customer': { en: 'Customer', hi: 'ग्राहक', kn: 'ಗ್ರಾಹಕ' },
  'detail.corrected': { en: 'Marked corrected', hi: 'सुधारा गया चिह्नित', kn: 'ಸರಿಪಡಿಸಲಾಗಿದೆ ಎಂದು ಗುರುತಿಸಲಾಗಿದೆ' },
  'detail.linkSent': { en: 'Payment link sent by SMS', hi: 'भुगतान लिंक SMS से भेजा गया', kn: 'ಪಾವತಿ ಲಿಂಕ್ SMS ಮೂಲಕ ಕಳುಹಿಸಲಾಗಿದೆ' },
  'detail.noPhone': { en: 'No phone number on this order', hi: 'इस ऑर्डर पर फ़ोन नंबर नहीं है', kn: 'ಈ ಆರ್ಡರ್‌ನಲ್ಲಿ ಫೋನ್ ಸಂಖ್ಯೆ ಇಲ್ಲ' },
  'detail.placed': { en: 'Placed', hi: 'दर्ज', kn: 'ದಾಖಲಾಗಿದೆ' },
  'detail.cancelledReason': { en: 'Cancelled: {reason}', hi: 'रद्द: {reason}', kn: 'ರದ್ದು: {reason}' },
  'detail.linkStatus': { en: 'Link {status}', hi: 'लिंक {status}', kn: 'ಲಿಂಕ್ {status}' },

  // ---- manual order entry (Build Spec §7) ----
  'manual.title': { en: 'New order', hi: 'नया ऑर्डर', kn: 'ಹೊಸ ಆರ್ಡರ್' },
  'manual.fulfilment': { en: 'How is it served?', hi: 'कैसे दिया जाएगा?', kn: 'ಹೇಗೆ ನೀಡಲಾಗುತ್ತದೆ?' },
  'manual.dineIn': { en: 'Table', hi: 'टेबल', kn: 'ಟೇಬಲ್' },
  'manual.pickup': { en: 'Pickup', hi: 'पिकअप', kn: 'ಪಿಕಪ್' },
  'manual.delivery': { en: 'Delivery', hi: 'डिलीवरी', kn: 'ಡೆಲಿವರಿ' },
  'manual.table': { en: 'Table number', hi: 'टेबल नंबर', kn: 'ಟೇಬಲ್ ಸಂಖ್ಯೆ' },
  'manual.phone': { en: 'Customer mobile (optional)', hi: 'ग्राहक का मोबाइल (वैकल्पिक)', kn: 'ಗ್ರಾಹಕರ ಮೊಬೈಲ್ (ಐಚ್ಛಿಕ)' },
  'manual.lookup': { en: 'Look up', hi: 'खोजें', kn: 'ಹುಡುಕಿ' },
  'manual.profile': { en: 'Profile on file', hi: 'प्रोफ़ाइल मौजूद है', kn: 'ಪ್ರೊಫೈಲ್ ಇದೆ' },
  'manual.noConsent': {
    en: 'No consent on file for this number. The order is linked to the number only; no address or name can be saved.',
    hi: 'इस नंबर की सहमति दर्ज नहीं है। ऑर्डर सिर्फ़ नंबर से जुड़ेगा; पता या नाम नहीं सहेजा जा सकता।',
    kn: 'ಈ ಸಂಖ್ಯೆಗೆ ಒಪ್ಪಿಗೆ ದಾಖಲಾಗಿಲ್ಲ. ಆರ್ಡರ್ ಸಂಖ್ಯೆಗೆ ಮಾತ್ರ ಜೋಡಿಸಲಾಗುತ್ತದೆ; ವಿಳಾಸ ಅಥವಾ ಹೆಸರು ಉಳಿಸಲಾಗದು.',
  },
  'manual.addressPending': {
    en: 'The order will be pinned as address pending. Call the customer to confirm the address.',
    hi: 'ऑर्डर "पता बाकी" के रूप में पिन होगा। पता पक्का करने के लिए ग्राहक को कॉल करें।',
    kn: 'ಆರ್ಡರ್ "ವಿಳಾಸ ಬಾಕಿ" ಎಂದು ಪಿನ್ ಆಗುತ್ತದೆ. ವಿಳಾಸ ಖಚಿತಪಡಿಸಲು ಗ್ರಾಹಕರಿಗೆ ಕರೆ ಮಾಡಿ.',
  },
  'manual.savedAddress': { en: 'Saved address', hi: 'सहेजा हुआ पता', kn: 'ಉಳಿಸಿದ ವಿಳಾಸ' },
  'manual.newAddress': { en: 'New address', hi: 'नया पता', kn: 'ಹೊಸ ವಿಳಾಸ' },
  'manual.line1': { en: 'House, street', hi: 'मकान, गली', kn: 'ಮನೆ, ರಸ್ತೆ' },
  'manual.landmark': { en: 'Landmark', hi: 'लैंडमार्क', kn: 'ಗುರುತು' },
  'manual.pincode': { en: 'Pincode', hi: 'पिनकोड', kn: 'ಪಿನ್‌ಕೋಡ್' },
  'manual.notServed': { en: 'We do not deliver to this pincode', hi: 'हम इस पिनकोड पर डिलीवरी नहीं करते', kn: 'ಈ ಪಿನ್‌ಕೋಡ್‌ಗೆ ನಾವು ಡೆಲಿವರಿ ಮಾಡುವುದಿಲ್ಲ' },
  'manual.notes': { en: 'Notes for the kitchen', hi: 'किचन के लिए नोट', kn: 'ಅಡುಗೆಮನೆಗೆ ಟಿಪ್ಪಣಿ' },
  'manual.payment': { en: 'Payment', hi: 'भुगतान', kn: 'ಪಾವತಿ' },
  'manual.sendUpi': { en: 'Send UPI link by SMS', hi: 'SMS से UPI लिंक भेजें', kn: 'SMS ಮೂಲಕ UPI ಲಿಂಕ್ ಕಳುಹಿಸಿ' },
  'manual.upiNeedsPhone': { en: 'A UPI link needs a mobile number', hi: 'UPI लिंक के लिए मोबाइल नंबर चाहिए', kn: 'UPI ಲಿಂಕ್‌ಗೆ ಮೊಬೈಲ್ ಸಂಖ್ಯೆ ಬೇಕು' },
  'manual.place': { en: 'Place order', hi: 'ऑर्डर दर्ज करें', kn: 'ಆರ್ಡರ್ ದಾಖಲಿಸಿ' },
  'manual.placing': { en: 'Placing…', hi: 'दर्ज हो रहा है…', kn: 'ದಾಖಲಿಸಲಾಗುತ್ತಿದೆ…' },
  'manual.choose': { en: 'Choose', hi: 'चुनें', kn: 'ಆಯ್ಕೆ ಮಾಡಿ' },
  'manual.addToOrder': { en: 'Add to order', hi: 'ऑर्डर में जोड़ें', kn: 'ಆರ್ಡರ್‌ಗೆ ಸೇರಿಸಿ' },
  'manual.required': { en: 'Required', hi: 'ज़रूरी', kn: 'ಅಗತ್ಯ' },
  'manual.upTo': { en: 'Up to {n}', hi: 'अधिकतम {n}', kn: 'ಗರಿಷ್ಠ {n}' },
  'manual.order': { en: 'Order', hi: 'ऑर्डर', kn: 'ಆರ್ಡರ್' },
  'manual.failed': { en: 'Could not place the order. Check the details and try again.', hi: 'ऑर्डर दर्ज नहीं हो सका। विवरण जाँचकर फिर कोशिश करें।', kn: 'ಆರ್ಡರ್ ದಾಖಲಿಸಲಾಗಲಿಲ್ಲ. ವಿವರ ಪರಿಶೀಲಿಸಿ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.' },
  'manual.viewOrder': { en: 'Review order', hi: 'ऑर्डर देखें', kn: 'ಆರ್ಡರ್ ಪರಿಶೀಲಿಸಿ' },

  // ---- menu availability (Build Spec §7 "sold out today") ----
  'menu.markSoldOut': { en: 'Mark sold out', hi: 'खत्म हो गया', kn: 'ಮುಗಿದಿದೆ ಎಂದು ಗುರುತಿಸಿ' },
  'menu.markAvailable': { en: 'Mark available', hi: 'उपलब्ध करें', kn: 'ಲಭ್ಯ ಎಂದು ಗುರುತಿಸಿ' },
  'menu.publish': { en: 'Publish menu', hi: 'मेन्यू प्रकाशित करें', kn: 'ಮೆನು ಪ್ರಕಟಿಸಿ' },
  'menu.version': { en: 'Version {v}', hi: 'संस्करण {v}', kn: 'ಆವೃತ್ತಿ {v}' },
  'menu.edit': { en: 'Edit', hi: 'बदलें', kn: 'ಸಂಪಾದಿಸಿ' },
  'menu.addItem': { en: 'Add item', hi: 'आइटम जोड़ें', kn: 'ಐಟಂ ಸೇರಿಸಿ' },

  // ---- common ----
  'common.saved': { en: 'Saved', hi: 'सहेजा गया', kn: 'ಉಳಿಸಲಾಗಿದೆ' },
  'common.failed': { en: 'Could not save. Try again.', hi: 'सहेजा नहीं जा सका। फिर कोशिश करें।', kn: 'ಉಳಿಸಲಾಗಲಿಲ್ಲ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.' },
} as const satisfies Record<string, Record<Lang, string>>

export type DashKey = keyof typeof DICT

export function td(key: DashKey, lang: Lang, vars?: Record<string, string | number>): string {
  let out: string = DICT[key][lang]
  if (vars) for (const [k, v] of Object.entries(vars)) out = out.replaceAll(`{${k}}`, String(v))
  return out
}
