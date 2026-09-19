/**
 * UI strings for the three surfaces, in the three MVP languages (Ideation §11).
 *
 * Order-state labels are NOT here: they live in contracts/i18n/order-states.json because the
 * Python voice service reads the same file at M2 (ADR 0001). `orderStateLabel` below is the
 * only way a component should obtain one.
 *
 * Hindi and Kannada are interim, not native-reviewed — same caveat as the JSON file
 * (ADR 0002 §4). `reviewed` records that so a page can show a notice if it wants to.
 *
 * UK English throughout.
 */

import orderStates from '../../contracts/i18n/order-states.json' with { type: 'json' }
import type { Fulfilment, OrderStatus } from '../core/orders.ts'

export type Lang = 'hi' | 'en' | 'kn'

export const reviewed: Readonly<Record<Lang, boolean>> = { en: true, hi: false, kn: false }

// ponytail: one dictionary for all three surfaces. Any client component that calls t() pulls the
// whole object (~10 KB raw, ~3 KB gzipped) into its bundle. Split it per surface the day the
// ordering page's 100 KB budget (Build Spec §6) says so; until then one file is easier to review
// for a translator.
const DICT = {
  // ---- login / OTP ----
  'login.title': { en: 'Sign in', hi: 'साइन इन करें', kn: 'ಸೈನ್ ಇನ್ ಮಾಡಿ' },
  'login.phone': { en: 'Mobile number', hi: 'मोबाइल नंबर', kn: 'ಮೊಬೈಲ್ ಸಂಖ್ಯೆ' },
  'login.sendCode': { en: 'Send code', hi: 'कोड भेजें', kn: 'ಕೋಡ್ ಕಳುಹಿಸಿ' },
  'login.phoneInvalid': {
    en: 'Enter a 10-digit mobile number starting with 6, 7, 8 or 9',
    hi: '6, 7, 8 या 9 से शुरू होने वाला 10 अंकों का मोबाइल नंबर डालें',
    kn: '6, 7, 8 ಅಥವಾ 9 ರಿಂದ ಪ್ರಾರಂಭವಾಗುವ 10 ಅಂಕಿಯ ಮೊಬೈಲ್ ಸಂಖ್ಯೆ ನಮೂದಿಸಿ',
  },
  'otp.label': { en: 'Enter the 6-digit code', hi: '6 अंकों का कोड डालें', kn: '6 ಅಂಕಿಯ ಕೋಡ್ ನಮೂದಿಸಿ' },
  'otp.help': { en: 'Sent by SMS to +91 {phone}', hi: '+91 {phone} पर SMS से भेजा गया', kn: '+91 {phone} ಗೆ SMS ಮೂಲಕ ಕಳುಹಿಸಲಾಗಿದೆ' },
  'otp.verify': { en: 'Verify', hi: 'जाँचें', kn: 'ಪರಿಶೀಲಿಸಿ' },
  'otp.verifying': { en: 'Verifying…', hi: 'जाँच हो रही है…', kn: 'ಪರಿಶೀಲಿಸಲಾಗುತ್ತಿದೆ…' },
  'otp.resend': { en: 'Resend code', hi: 'कोड फिर भेजें', kn: 'ಕೋಡ್ ಮತ್ತೆ ಕಳುಹಿಸಿ' },
  'otp.resendIn': { en: 'Resend in {time}', hi: '{time} में फिर भेजें', kn: '{time} ನಲ್ಲಿ ಮತ್ತೆ ಕಳುಹಿಸಿ' },
  'otp.wrong': {
    en: 'That code did not match. Check the SMS and try again.',
    hi: 'यह कोड मेल नहीं खाया। SMS देखकर फिर कोशिश करें।',
    kn: 'ಈ ಕೋಡ್ ಹೊಂದಿಕೆಯಾಗಲಿಲ್ಲ. SMS ಪರಿಶೀಲಿಸಿ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.',
  },

  // ---- consent (Build Spec §10) ----
  'consent.label': {
    en: 'I agree to {restaurant} keeping my details as described above',
    hi: 'मैं सहमत हूँ कि {restaurant} ऊपर बताए अनुसार मेरी जानकारी रखे',
    kn: 'ಮೇಲೆ ವಿವರಿಸಿದಂತೆ {restaurant} ನನ್ನ ವಿವರಗಳನ್ನು ಇಟ್ಟುಕೊಳ್ಳಲು ನಾನು ಒಪ್ಪುತ್ತೇನೆ',
  },
  'consent.withdraw': { en: 'Withdraw consent', hi: 'सहमति वापस लें', kn: 'ಒಪ್ಪಿಗೆ ಹಿಂಪಡೆಯಿರಿ' },

  // ---- menu ----
  'menu.add': { en: 'Add', hi: 'जोड़ें', kn: 'ಸೇರಿಸಿ' },
  'menu.remove': { en: 'Remove {item}', hi: '{item} हटाएँ', kn: '{item} ತೆಗೆದುಹಾಕಿ' },
  'menu.unavailable': { en: 'Not available today', hi: 'आज उपलब्ध नहीं', kn: 'ಇಂದು ಲಭ್ಯವಿಲ್ಲ' },
  'menu.closed': {
    en: 'This restaurant is not taking orders right now',
    hi: 'यह रेस्टोरेंट अभी ऑर्डर नहीं ले रहा है',
    kn: 'ಈ ರೆಸ್ಟೋರೆಂಟ್ ಈಗ ಆರ್ಡರ್ ತೆಗೆದುಕೊಳ್ಳುತ್ತಿಲ್ಲ',
  },
  'menu.veg': { en: 'Vegetarian', hi: 'शाकाहारी', kn: 'ಸಸ್ಯಾಹಾರಿ' },
  'menu.nonveg': { en: 'Non-vegetarian', hi: 'मांसाहारी', kn: 'ಮಾಂಸಾಹಾರಿ' },
  'menu.search': { en: 'Search the menu', hi: 'मेन्यू में खोजें', kn: 'ಮೆನುವಿನಲ್ಲಿ ಹುಡುಕಿ' },
  'qty.label': { en: 'Quantity', hi: 'मात्रा', kn: 'ಪ್ರಮಾಣ' },
  'qty.decrease': { en: 'Decrease quantity', hi: 'मात्रा घटाएँ', kn: 'ಪ್ರಮಾಣ ಕಡಿಮೆ ಮಾಡಿ' },
  'qty.increase': { en: 'Increase quantity', hi: 'मात्रा बढ़ाएँ', kn: 'ಪ್ರಮಾಣ ಹೆಚ್ಚಿಸಿ' },
  'qty.max': { en: 'Maximum {max} per order', hi: 'एक ऑर्डर में अधिकतम {max}', kn: 'ಒಂದು ಆರ್ಡರ್‌ಗೆ ಗರಿಷ್ಠ {max}' },

  // ---- cart / checkout (design §7.4) ----
  // The count is rendered as its own `.num` span by the caller, so the words carry no numeral.
  'cart.itemWord': { en: 'item', hi: 'आइटम', kn: 'ಐಟಂ' },
  'cart.itemsWord': { en: 'items', hi: 'आइटम', kn: 'ಐಟಂಗಳು' },
  'cart.view': { en: 'View cart', hi: 'कार्ट देखें', kn: 'ಕಾರ್ಟ್ ನೋಡಿ' },
  'cart.sendToKitchen': { en: 'Send to kitchen', hi: 'किचन में भेजें', kn: 'ಅಡುಗೆಮನೆಗೆ ಕಳುಹಿಸಿ' },
  'cart.continueToAddress': { en: 'Continue to address', hi: 'पते पर जाएँ', kn: 'ವಿಳಾಸಕ್ಕೆ ಮುಂದುವರಿಯಿರಿ' },
  'cart.subtotal': { en: 'Subtotal', hi: 'उप-योग', kn: 'ಉಪಮೊತ್ತ' },
  'cart.discount': { en: 'Discount', hi: 'छूट', kn: 'ರಿಯಾಯಿತಿ' },
  'cart.total': { en: 'Total', hi: 'कुल', kn: 'ಒಟ್ಟು' },
  'cart.empty': { en: 'Your cart is empty', hi: 'आपका कार्ट खाली है', kn: 'ನಿಮ್ಮ ಕಾರ್ಟ್ ಖಾಲಿಯಾಗಿದೆ' },
  'checkout.step': { en: 'Step {n} of {total}', hi: 'चरण {n} / {total}', kn: 'ಹಂತ {n} / {total}' },
  'checkout.items': { en: 'Items', hi: 'आइटम', kn: 'ಐಟಂಗಳು' },
  'checkout.phone': { en: 'Phone', hi: 'फ़ोन', kn: 'ಫೋನ್' },
  'checkout.confirm': { en: 'Confirm', hi: 'पुष्टि', kn: 'ದೃಢೀಕರಣ' },
  'checkout.table': { en: 'Table {n}', hi: 'टेबल {n}', kn: 'ಟೇಬಲ್ {n}' },
  'checkout.address': { en: 'Delivery address', hi: 'डिलीवरी का पता', kn: 'ವಿತರಣಾ ವಿಳಾಸ' },
  'checkout.payUpi': { en: 'Pay by UPI', hi: 'UPI से भुगतान करें', kn: 'UPI ಮೂಲಕ ಪಾವತಿಸಿ' },
  'checkout.payCod': { en: 'Cash on delivery', hi: 'डिलीवरी पर नकद', kn: 'ಡೆಲಿವರಿ ವೇಳೆ ನಗದು' },
  'checkout.placeOrder': { en: 'Place order', hi: 'ऑर्डर करें', kn: 'ಆರ್ಡರ್ ಮಾಡಿ' },
  'checkout.codeApplied': { en: '{percent}% off applied', hi: '{percent}% छूट लागू', kn: '{percent}% ರಿಯಾಯಿತಿ ಅನ್ವಯಿಸಲಾಗಿದೆ' },
  'checkout.codeUsed': {
    // One card per phone per restaurant (Ideation §8): a second card from the same restaurant is
    // refused too, so the message names the restaurant, not the code.
    en: 'A card from this restaurant has already been used with this number',
    hi: 'इस रेस्तरां का कार्ड इस नंबर से पहले ही इस्तेमाल हो चुका है',
    kn: 'ಈ ರೆಸ್ಟೋರೆಂಟ್‌ನ ಕಾರ್ಡ್ ಈ ಸಂಖ್ಯೆಯಿಂದ ಈಗಾಗಲೇ ಬಳಸಲಾಗಿದೆ',
  },
  'payment.tryAgain': { en: 'Try again', hi: 'फिर कोशिश करें', kn: 'ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ' },
  'payment.payAtCounter': { en: 'Pay at the counter', hi: 'काउंटर पर भुगतान करें', kn: 'ಕೌಂಟರ್‌ನಲ್ಲಿ ಪಾವತಿಸಿ' },

  // ---- payment state, as shown on the order card ----
  'payment.paid': { en: 'Paid', hi: 'भुगतान हो गया', kn: 'ಪಾವತಿಸಲಾಗಿದೆ' },
  'payment.awaiting': { en: 'Awaiting payment', hi: 'भुगतान बाकी', kn: 'ಪಾವತಿ ಬಾಕಿ' },
  'payment.unpaid': { en: 'Unpaid', hi: 'भुगतान नहीं हुआ', kn: 'ಪಾವತಿಸಿಲ್ಲ' },
  'payment.refunded': { en: 'Refunded', hi: 'रिफ़ंड हो गया', kn: 'ಮರುಪಾವತಿಸಲಾಗಿದೆ' },
  'payment.cod': { en: 'Cash on delivery', hi: 'डिलीवरी पर नकद', kn: 'ಡೆಲಿವರಿ ವೇಳೆ ನಗದು' },
  'payment.payAtTable': { en: 'Pay at table', hi: 'टेबल पर भुगतान', kn: 'ಟೇಬಲ್‌ನಲ್ಲಿ ಪಾವತಿ' },
  'channel.ai_call': { en: 'Phone call', hi: 'फ़ोन कॉल', kn: 'ಫೋನ್ ಕರೆ' },
  'channel.page_table': { en: 'Table QR', hi: 'टेबल QR', kn: 'ಟೇಬಲ್ QR' },
  'channel.page_delivery': { en: 'Ordering page', hi: 'ऑर्डर पेज', kn: 'ಆರ್ಡರ್ ಪುಟ' },
  'channel.staff_manual': { en: 'Entered by staff', hi: 'स्टाफ़ ने दर्ज किया', kn: 'ಸಿಬ್ಬಂದಿ ನಮೂದಿಸಿದ್ದು' },

  // ---- dashboard order actions (Build Spec §7, design §6.2). Labels are the ACTION. ----
  'action.accept': { en: 'Accept order', hi: 'ऑर्डर स्वीकार करें', kn: 'ಆರ್ಡರ್ ಸ್ವೀಕರಿಸಿ' },
  'action.startPreparing': { en: 'Start preparing', hi: 'बनाना शुरू करें', kn: 'ತಯಾರಿ ಪ್ರಾರಂಭಿಸಿ' },
  'action.markReady': { en: 'Mark ready', hi: 'तैयार है', kn: 'ಸಿದ್ಧವಾಗಿದೆ' },
  'action.outForDelivery': { en: 'Out for delivery', hi: 'डिलीवरी के लिए निकला', kn: 'ಡೆಲಿವರಿಗೆ ಹೊರಟಿದೆ' },
  'action.markDelivered': { en: 'Mark delivered', hi: 'पहुँच गया', kn: 'ತಲುಪಿದೆ' },
  'action.markServed': { en: 'Mark served', hi: 'परोस दिया', kn: 'ಬಡಿಸಲಾಗಿದೆ' },
  'action.markCollected': { en: 'Mark collected', hi: 'ले लिया गया', kn: 'ಪಡೆಯಲಾಗಿದೆ' },
  'action.confirmCod': {
    en: 'Confirm as cash on delivery',
    hi: 'डिलीवरी पर नकद के रूप में पक्का करें',
    kn: 'ಡೆಲಿವರಿ ವೇಳೆ ನಗದು ಎಂದು ಖಚಿತಪಡಿಸಿ',
  },
  'action.confirm': { en: 'Confirm order', hi: 'ऑर्डर पक्का करें', kn: 'ಆರ್ಡರ್ ಖಚಿತಪಡಿಸಿ' },
  'action.getAddress': { en: 'Get address', hi: 'पता लें', kn: 'ವಿಳಾಸ ಪಡೆಯಿರಿ' },
  'action.cancel': { en: 'Cancel order', hi: 'ऑर्डर रद्द करें', kn: 'ಆರ್ಡರ್ ರದ್ದುಮಾಡಿ' },
  'action.cancelConfirm': { en: 'Cancel this order?', hi: 'यह ऑर्डर रद्द करें?', kn: 'ಈ ಆರ್ಡರ್ ರದ್ದುಮಾಡುವುದೇ?' },
  'action.cancelReason': { en: 'Reason', hi: 'कारण', kn: 'ಕಾರಣ' },
  'action.cancelReasonRequired': { en: 'A reason is required', hi: 'कारण ज़रूरी है', kn: 'ಕಾರಣ ಅಗತ್ಯವಿದೆ' },
  'action.keep': { en: 'Keep order', hi: 'ऑर्डर रखें', kn: 'ಆರ್ಡರ್ ಇರಿಸಿ' },
  'action.more': { en: 'More actions', hi: 'और विकल्प', kn: 'ಇನ್ನಷ್ಟು ಆಯ್ಕೆಗಳು' },
  'action.call': { en: 'Call customer', hi: 'ग्राहक को कॉल करें', kn: 'ಗ್ರಾಹಕರಿಗೆ ಕರೆ ಮಾಡಿ' },
  'action.retry': {
    en: 'Could not update. Tap to try again.',
    hi: 'अपडेट नहीं हुआ। फिर से कोशिश करने के लिए टैप करें।',
    kn: 'ನವೀಕರಿಸಲಾಗಲಿಲ್ಲ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಲು ಟ್ಯಾಪ್ ಮಾಡಿ.',
  },
  'action.saving': { en: 'Saving…', hi: 'सहेजा जा रहा है…', kn: 'ಉಳಿಸಲಾಗುತ್ತಿದೆ…' },
  'card.pinned': { en: 'Pinned', hi: 'पिन किया', kn: 'ಪಿನ್ ಮಾಡಲಾಗಿದೆ' },
  'card.showItems': { en: 'Show items', hi: 'आइटम दिखाएँ', kn: 'ಐಟಂಗಳನ್ನು ತೋರಿಸಿ' },
  'card.hideItems': { en: 'Hide items', hi: 'आइटम छिपाएँ', kn: 'ಐಟಂಗಳನ್ನು ಮರೆಮಾಡಿ' },
  'card.notes': { en: 'Notes', hi: 'नोट', kn: 'ಟಿಪ್ಪಣಿ' },
  'card.address': { en: 'Address', hi: 'पता', kn: 'ವಿಳಾಸ' },
  'card.elapsed': { en: 'Time since order', hi: 'ऑर्डर के बाद का समय', kn: 'ಆರ್ಡರ್ ನಂತರದ ಸಮಯ' },

  // ---- board ----
  'board.newOrderOne': { en: '1 new order', hi: '1 नया ऑर्डर', kn: '1 ಹೊಸ ಆರ್ಡರ್' },
  'board.newOrders': { en: '{n} new orders', hi: '{n} नए ऑर्डर', kn: '{n} ಹೊಸ ಆರ್ಡರ್‌ಗಳು' },
  'board.done': { en: 'Done', hi: 'पूरे हुए', kn: 'ಮುಗಿದವು' },
  'board.enableSound': {
    en: 'Tap to enable order sounds',
    hi: 'ऑर्डर की आवाज़ चालू करने के लिए टैप करें',
    kn: 'ಆರ್ಡರ್ ಶಬ್ದ ಸಕ್ರಿಯಗೊಳಿಸಲು ಟ್ಯಾಪ್ ಮಾಡಿ',
  },
  'net.offline': { en: 'No connection. Retrying…', hi: 'कनेक्शन नहीं है। फिर कोशिश हो रही है…', kn: 'ಸಂಪರ್ಕವಿಲ್ಲ. ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಲಾಗುತ್ತಿದೆ…' },
  'net.retry': { en: 'Retry now', hi: 'अभी फिर कोशिश करें', kn: 'ಈಗ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ' },

  // ---- the Monday aggregator-count nag (design §7.8, Build Spec §7) ----
  'nag.question': {
    en: 'How many orders came through Swiggy or Zomato last week?',
    hi: 'पिछले हफ़्ते Swiggy या Zomato से कितने ऑर्डर आए?',
    kn: 'ಕಳೆದ ವಾರ Swiggy ಅಥವಾ Zomato ಮೂಲಕ ಎಷ್ಟು ಆರ್ಡರ್‌ಗಳು ಬಂದವು?',
  },
  'nag.why': {
    en: 'We track this to show you how much of your business has moved to direct ordering.',
    hi: 'हम यह इसलिए पूछते हैं ताकि आपको दिखा सकें कि आपका कितना कारोबार सीधे ऑर्डर पर आ गया है।',
    kn: 'ನಿಮ್ಮ ವ್ಯಾಪಾರದ ಎಷ್ಟು ಭಾಗ ನೇರ ಆರ್ಡರ್‌ಗೆ ಬಂದಿದೆ ಎಂದು ತೋರಿಸಲು ನಾವು ಇದನ್ನು ದಾಖಲಿಸುತ್ತೇವೆ.',
  },
  'nag.exact': { en: 'or enter exact:', hi: 'या सही संख्या डालें:', kn: 'ಅಥವಾ ನಿಖರ ಸಂಖ್ಯೆ ನಮೂದಿಸಿ:' },
  'nag.swiggy': { en: 'Swiggy orders', hi: 'Swiggy ऑर्डर', kn: 'Swiggy ಆರ್ಡರ್‌ಗಳು' },
  'nag.zomato': { en: 'Zomato orders', hi: 'Zomato ऑर्डर', kn: 'Zomato ಆರ್ಡರ್‌ಗಳು' },
  'nag.save': { en: 'Save', hi: 'सहेजें', kn: 'ಉಳಿಸಿ' },
  'nag.skip': { en: 'Skip this week', hi: 'इस हफ़्ते छोड़ें', kn: 'ಈ ವಾರ ಬಿಟ್ಟುಬಿಡಿ' },
  'nag.collapsed': { en: 'Weekly aggregator count', hi: 'साप्ताहिक एग्रीगेटर गिनती', kn: 'ವಾರದ ಅಗ್ರಿಗೇಟರ್ ಎಣಿಕೆ' },
  'nag.close': { en: 'Close', hi: 'बंद करें', kn: 'ಮುಚ್ಚಿ' },

  // ---- empty states (design §7.9) ----
  'empty.firstRun': {
    en: 'Your order board is ready. When a customer orders from your page, it appears here.',
    hi: 'आपका ऑर्डर बोर्ड तैयार है। जब कोई ग्राहक आपके पेज से ऑर्डर करेगा, वह यहाँ दिखेगा।',
    kn: 'ನಿಮ್ಮ ಆರ್ಡರ್ ಬೋರ್ಡ್ ಸಿದ್ಧವಾಗಿದೆ. ಗ್ರಾಹಕರು ನಿಮ್ಮ ಪುಟದಿಂದ ಆರ್ಡರ್ ಮಾಡಿದಾಗ ಅದು ಇಲ್ಲಿ ಕಾಣಿಸುತ್ತದೆ.',
  },
  'empty.previewPage': { en: 'Preview my page', hi: 'मेरा पेज देखें', kn: 'ನನ್ನ ಪುಟ ನೋಡಿ' },
  'empty.allDone': { en: 'All caught up. {n} orders today.', hi: 'सब हो गया। आज {n} ऑर्डर।', kn: 'ಎಲ್ಲಾ ಮುಗಿದಿದೆ. ಇಂದು {n} ಆರ್ಡರ್‌ಗಳು.' },
  'empty.zeroResult': {
    en: 'No {things} match ‘{query}’ in {filter}.',
    hi: '{filter} में ‘{query}’ से मेल खाता कोई {things} नहीं।',
    kn: '{filter} ನಲ್ಲಿ ‘{query}’ ಗೆ ಹೊಂದುವ {things} ಇಲ್ಲ.',
  },
  'empty.clearFilters': { en: 'Clear filters', hi: 'फ़िल्टर हटाएँ', kn: 'ಫಿಲ್ಟರ್‌ಗಳನ್ನು ತೆಗೆದುಹಾಕಿ' },

  // ---- ordering page: codes, chooser, checkout steps, status (Build Spec §6) ----
  'code.applied': { en: '{percent}% off applied with code {code}', hi: 'कोड {code} से {percent}% छूट लागू', kn: 'ಕೋಡ್ {code} ನಿಂದ {percent}% ರಿಯಾಯಿತಿ ಅನ್ವಯಿಸಲಾಗಿದೆ' },
  'code.not_found': { en: 'We could not find code {code}', hi: 'कोड {code} नहीं मिला', kn: 'ಕೋಡ್ {code} ಸಿಗಲಿಲ್ಲ' },
  'code.wrong_restaurant': { en: 'Code {code} is for a different restaurant', hi: 'कोड {code} किसी और रेस्टोरेंट का है', kn: 'ಕೋಡ್ {code} ಬೇರೆ ರೆಸ್ಟೋರೆಂಟ್‌ನದು' },
  'code.inactive': { en: 'Code {code} is no longer active', hi: 'कोड {code} अब चालू नहीं है', kn: 'ಕೋಡ್ {code} ಈಗ ಸಕ್ರಿಯವಾಗಿಲ್ಲ' },
  'code.not_yet_valid': { en: 'Code {code} is not valid yet', hi: 'कोड {code} अभी मान्य नहीं है', kn: 'ಕೋಡ್ {code} ಇನ್ನೂ ಮಾನ್ಯವಾಗಿಲ್ಲ' },
  'code.expired': { en: 'Code {code} has expired', hi: 'कोड {code} की अवधि खत्म हो गई', kn: 'ಕೋಡ್ {code} ಅವಧಿ ಮುಗಿದಿದೆ' },
  'code.already_redeemed': {
    en: 'A card from this restaurant has already been used with this number, so the menu is shown without the discount',
    hi: 'इस रेस्तरां का कार्ड इस नंबर से पहले इस्तेमाल हो चुका है, इसलिए मेन्यू बिना छूट के दिखाया गया है',
    kn: 'ಈ ರೆಸ್ಟೋರೆಂಟ್‌ನ ಕಾರ್ಡ್ ಈ ಸಂಖ್ಯೆಯಿಂದ ಈಗಾಗಲೇ ಬಳಸಲಾಗಿದೆ, ಆದ್ದರಿಂದ ಮೆನು ರಿಯಾಯಿತಿ ಇಲ್ಲದೆ ತೋರಿಸಲಾಗಿದೆ',
  },
  'code.limit_reached': { en: 'Code {code} has been used the maximum number of times', hi: 'कोड {code} अधिकतम बार इस्तेमाल हो चुका है', kn: 'ಕೋಡ್ {code} ಗರಿಷ್ಠ ಬಾರಿ ಬಳಸಲಾಗಿದೆ' },
  'code.enter': { en: 'Have a code?', hi: 'कोड है?', kn: 'ಕೋಡ್ ಇದೆಯೇ?' },
  'code.apply': { en: 'Apply', hi: 'लागू करें', kn: 'ಅನ್ವಯಿಸಿ' },
  'menu.noMatch': { en: 'No dishes match ‘{query}’', hi: '‘{query}’ से मेल खाता कोई व्यंजन नहीं', kn: '‘{query}’ ಗೆ ಹೊಂದುವ ಖಾದ್ಯಗಳಿಲ್ಲ' },
  'menu.categories': { en: 'Categories', hi: 'श्रेणियाँ', kn: 'ವರ್ಗಗಳು' },
  'menu.choose': { en: 'Choose for {item}', hi: '{item} के लिए चुनें', kn: '{item} ಗಾಗಿ ಆಯ್ಕೆಮಾಡಿ' },
  'menu.required': { en: 'Required', hi: 'ज़रूरी', kn: 'ಅಗತ್ಯ' },
  'menu.upTo': { en: 'Choose up to {max}', hi: 'अधिकतम {max} चुनें', kn: 'ಗರಿಷ್ಠ {max} ಆಯ್ಕೆಮಾಡಿ' },
  'menu.addToCart': { en: 'Add to cart', hi: 'कार्ट में जोड़ें', kn: 'ಕಾರ್ಟ್‌ಗೆ ಸೇರಿಸಿ' },
  'menu.callToOrder': { en: 'Call to order', hi: 'ऑर्डर के लिए कॉल करें', kn: 'ಆರ್ಡರ್ ಮಾಡಲು ಕರೆ ಮಾಡಿ' },
  'checkout.title': { en: 'Checkout', hi: 'चेकआउट', kn: 'ಚೆಕ್‌ಔಟ್' },
  'checkout.continue': { en: 'Continue', hi: 'आगे बढ़ें', kn: 'ಮುಂದುವರಿಯಿರಿ' },
  'checkout.backToMenu': { en: 'Back to menu', hi: 'मेन्यू पर वापस', kn: 'ಮೆನುಗೆ ಹಿಂತಿರುಗಿ' },
  'checkout.demoCode': { en: 'Demo: your code is {code}', hi: 'डेमो: आपका कोड {code} है', kn: 'ಡೆಮೊ: ನಿಮ್ಮ ಕೋಡ್ {code}' },
  'checkout.rateLimited': {
    en: 'Too many attempts. Please wait a few minutes and try again.',
    hi: 'बहुत ज़्यादा कोशिशें। कुछ मिनट रुककर फिर कोशिश करें।',
    kn: 'ಹೆಚ್ಚು ಪ್ರಯತ್ನಗಳು. ಕೆಲವು ನಿಮಿಷ ಕಾದು ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.',
  },
  'checkout.otpExpired': { en: 'That code has expired. Request a new one.', hi: 'यह कोड खत्म हो गया। नया कोड मँगाएँ।', kn: 'ಈ ಕೋಡ್ ಅವಧಿ ಮುಗಿದಿದೆ. ಹೊಸದನ್ನು ಕೇಳಿ.' },
  'consent.required': { en: 'Tick the box to continue', hi: 'आगे बढ़ने के लिए बॉक्स पर टिक करें', kn: 'ಮುಂದುವರಿಯಲು ಬಾಕ್ಸ್ ಟಿಕ್ ಮಾಡಿ' },
  'consent.withdrawn': {
    en: 'Your consent has been withdrawn. An order already being prepared is not affected.',
    hi: 'आपकी सहमति वापस ले ली गई है। जो ऑर्डर बन रहा है उस पर असर नहीं पड़ेगा।',
    kn: 'ನಿಮ್ಮ ಒಪ್ಪಿಗೆ ಹಿಂಪಡೆಯಲಾಗಿದೆ. ಈಗಾಗಲೇ ತಯಾರಾಗುತ್ತಿರುವ ಆರ್ಡರ್‌ಗೆ ಇದು ಅನ್ವಯಿಸುವುದಿಲ್ಲ.',
  },
  'address.saved': { en: 'Saved addresses', hi: 'सहेजे गए पते', kn: 'ಉಳಿಸಿದ ವಿಳಾಸಗಳು' },
  'address.new': { en: 'New address', hi: 'नया पता', kn: 'ಹೊಸ ವಿಳಾಸ' },
  'address.line1': { en: 'House / flat and street', hi: 'मकान / फ़्लैट और सड़क', kn: 'ಮನೆ / ಫ್ಲಾಟ್ ಮತ್ತು ರಸ್ತೆ' },
  'address.landmark': { en: 'Landmark', hi: 'लैंडमार्क', kn: 'ಗುರುತು' },
  'address.area': { en: 'Area', hi: 'इलाका', kn: 'ಪ್ರದೇಶ' },
  'address.pincode': { en: 'Pincode', hi: 'पिनकोड', kn: 'ಪಿನ್‌ಕೋಡ್' },
  'address.pincodeInvalid': { en: 'Enter a 6-digit pincode', hi: '6 अंकों का पिनकोड डालें', kn: '6 ಅಂಕಿಯ ಪಿನ್‌ಕೋಡ್ ನಮೂದಿಸಿ' },
  'address.deliverHere': { en: 'Deliver here', hi: 'यहाँ डिलीवर करें', kn: 'ಇಲ್ಲಿಗೆ ಡೆಲಿವರಿ ಮಾಡಿ' },
  'address.saveAndContinue': { en: 'Save and continue', hi: 'सहेजें और आगे बढ़ें', kn: 'ಉಳಿಸಿ ಮುಂದುವರಿಯಿರಿ' },
  'address.notServed': {
    en: '{restaurant} does not deliver to pincode {pincode} yet. Call them to check, or try another address.',
    hi: '{restaurant} अभी पिनकोड {pincode} पर डिलीवरी नहीं करता। पूछने के लिए कॉल करें, या दूसरा पता आज़माएँ।',
    kn: '{restaurant} ಇನ್ನೂ ಪಿನ್‌ಕೋಡ್ {pincode} ಗೆ ಡೆಲಿವರಿ ಮಾಡುವುದಿಲ್ಲ. ಕೇಳಲು ಕರೆ ಮಾಡಿ, ಅಥವಾ ಬೇರೆ ವಿಳಾಸ ಪ್ರಯತ್ನಿಸಿ.',
  },
  'address.call': { en: 'Call {restaurant}', hi: '{restaurant} को कॉल करें', kn: '{restaurant} ಗೆ ಕರೆ ಮಾಡಿ' },
  'address.confirmTitle': { en: 'Confirm your delivery address', hi: 'अपना डिलीवरी पता पक्का करें', kn: 'ನಿಮ್ಮ ಡೆಲಿವರಿ ವಿಳಾಸ ದೃಢೀಕರಿಸಿ' },
  'address.linkInvalid': {
    en: 'This link is no longer valid. Please call the restaurant.',
    hi: 'यह लिंक अब मान्य नहीं है। कृपया रेस्टोरेंट को कॉल करें।',
    kn: 'ಈ ಲಿಂಕ್ ಈಗ ಮಾನ್ಯವಾಗಿಲ್ಲ. ದಯವಿಟ್ಟು ರೆಸ್ಟೋರೆಂಟ್‌ಗೆ ಕರೆ ಮಾಡಿ.',
  },
  'checkout.tableInfo': { en: 'Your order goes to table {n}. Pay at the table.', hi: 'आपका ऑर्डर टेबल {n} पर जाएगा। टेबल पर भुगतान करें।', kn: 'ನಿಮ್ಮ ಆರ್ಡರ್ ಟೇಬಲ್ {n} ಗೆ ಹೋಗುತ್ತದೆ. ಟೇಬಲ್‌ನಲ್ಲಿ ಪಾವತಿಸಿ.' },
  'checkout.deliverTo': { en: 'Deliver to', hi: 'यहाँ डिलीवर करें', kn: 'ಇಲ್ಲಿಗೆ ಡೆಲಿವರಿ' },
  'checkout.change': { en: 'Change', hi: 'बदलें', kn: 'ಬದಲಿಸಿ' },
  'checkout.paymentMethod': { en: 'How would you like to pay?', hi: 'आप कैसे भुगतान करेंगे?', kn: 'ನೀವು ಹೇಗೆ ಪಾವತಿಸುತ್ತೀರಿ?' },
  'checkout.placing': { en: 'Placing your order…', hi: 'ऑर्डर हो रहा है…', kn: 'ಆರ್ಡರ್ ಮಾಡಲಾಗುತ್ತಿದೆ…' },
  'checkout.itemUnavailable': {
    en: 'Something in your cart is no longer available. Please check the menu and try again.',
    hi: 'आपके कार्ट की कोई चीज़ अब उपलब्ध नहीं है। मेन्यू देखकर फिर कोशिश करें।',
    kn: 'ನಿಮ್ಮ ಕಾರ್ಟ್‌ನಲ್ಲಿರುವ ಏನೋ ಈಗ ಲಭ್ಯವಿಲ್ಲ. ಮೆನು ಪರಿಶೀಲಿಸಿ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.',
  },
  'checkout.failed': {
    en: 'Could not place the order. Check your connection and try again.',
    hi: 'ऑर्डर नहीं हो सका। कनेक्शन देखकर फिर कोशिश करें।',
    kn: 'ಆರ್ಡರ್ ಮಾಡಲಾಗಲಿಲ್ಲ. ಸಂಪರ್ಕ ಪರಿಶೀಲಿಸಿ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.',
  },
  'status.thanks': { en: 'Thank you. {restaurant} has your order.', hi: 'धन्यवाद। {restaurant} को आपका ऑर्डर मिल गया।', kn: 'ಧನ್ಯವಾದಗಳು. {restaurant} ಗೆ ನಿಮ್ಮ ಆರ್ಡರ್ ತಲುಪಿದೆ.' },
  'status.awaitingPayment': {
    en: 'Your order will be confirmed once the payment is received.',
    hi: 'भुगतान मिलते ही आपका ऑर्डर पक्का हो जाएगा।',
    kn: 'ಪಾವತಿ ಬಂದ ತಕ್ಷಣ ನಿಮ್ಮ ಆರ್ಡರ್ ಖಚಿತವಾಗುತ್ತದೆ.',
  },
  'status.payNow': { en: 'Pay {amount} by UPI', hi: 'UPI से {amount} चुकाएँ', kn: 'UPI ಮೂಲಕ {amount} ಪಾವತಿಸಿ' },
  'status.paySms': { en: 'Use the payment link sent to you by SMS.', hi: 'SMS से भेजा गया भुगतान लिंक इस्तेमाल करें।', kn: 'SMS ಮೂಲಕ ಕಳುಹಿಸಿದ ಪಾವತಿ ಲಿಂಕ್ ಬಳಸಿ.' },
  'status.updates': { en: 'This page updates on its own.', hi: 'यह पेज अपने आप अपडेट होता है।', kn: 'ಈ ಪುಟ ತಾನಾಗಿಯೇ ನವೀಕರಿಸುತ್ತದೆ.' },
  'status.cancelled': { en: 'This order was cancelled.', hi: 'यह ऑर्डर रद्द कर दिया गया।', kn: 'ಈ ಆರ್ಡರ್ ರದ್ದುಗೊಳಿಸಲಾಗಿದೆ.' },
  'status.orderAgain': { en: 'Order again', hi: 'फिर से ऑर्डर करें', kn: 'ಮತ್ತೆ ಆರ್ಡರ್ ಮಾಡಿ' },
  'mock.title': { en: 'Demo payment', hi: 'डेमो भुगतान', kn: 'ಡೆಮೊ ಪಾವತಿ' },
  'mock.paying': { en: 'Paying {restaurant}', hi: '{restaurant} को भुगतान', kn: '{restaurant} ಗೆ ಪಾವತಿ' },
  'mock.pay': { en: 'Pay {amount}', hi: '{amount} चुकाएँ', kn: '{amount} ಪಾವತಿಸಿ' },
  'mock.note': { en: 'This is a demo payment screen. No money moves.', hi: 'यह डेमो भुगतान स्क्रीन है। कोई पैसा नहीं कटेगा।', kn: 'ಇದು ಡೆಮೊ ಪಾವತಿ ಪರದೆ. ಹಣ ಕಡಿತವಾಗುವುದಿಲ್ಲ.' },
  'mock.paid': { en: 'This link has already been paid.', hi: 'इस लिंक का भुगतान हो चुका है।', kn: 'ಈ ಲಿಂಕ್‌ಗೆ ಈಗಾಗಲೇ ಪಾವತಿಸಲಾಗಿದೆ.' },
  'mock.expired': { en: 'This payment link has expired.', hi: 'इस भुगतान लिंक की अवधि खत्म हो गई।', kn: 'ಈ ಪಾವತಿ ಲಿಂಕ್ ಅವಧಿ ಮುಗಿದಿದೆ.' },
  'footer.credit': { en: 'Ordering by ServeLine', hi: 'ऑर्डरिंग: ServeLine', kn: 'ಆರ್ಡರಿಂಗ್: ServeLine' },

  // ---- common ----
  'common.back': { en: 'Back', hi: 'पीछे', kn: 'ಹಿಂದೆ' },
  'common.next': { en: 'Next', hi: 'आगे', kn: 'ಮುಂದೆ' },
  'common.save': { en: 'Save', hi: 'सहेजें', kn: 'ಉಳಿಸಿ' },
  'common.cancel': { en: 'Cancel', hi: 'रद्द करें', kn: 'ರದ್ದುಮಾಡಿ' },
  'common.close': { en: 'Close', hi: 'बंद करें', kn: 'ಮುಚ್ಚಿ' },
  'common.language': { en: 'Language', hi: 'भाषा', kn: 'ಭಾಷೆ' },
} as const satisfies Record<string, Record<Lang, string>>

export type UiKey = keyof typeof DICT

/** Every key in the dictionary, for the test that checks all three languages are present. */
export const UI_KEYS = Object.keys(DICT) as UiKey[]

/**
 * Look up a UI string. `{name}` placeholders are replaced from `vars`; a placeholder with no
 * value is left as-is so the gap is visible in the UI rather than silently blank.
 */
export function t(key: UiKey, lang: Lang, vars?: Record<string, string | number>): string {
  let out: string = DICT[key][lang]
  if (vars) {
    for (const [name, value] of Object.entries(vars)) out = out.replaceAll(`{${name}}`, String(value))
  }
  return out
}

/**
 * The label for an order STATE (never the action — design §7.2), from the contract file.
 * ADR 0002 §6: `delivered` is one state with three labels, chosen by fulfilment.
 */
export function orderStateLabel(status: OrderStatus, fulfilment: Fulfilment, lang: Lang): string {
  if (status === 'delivered') return orderStates.delivered_by_fulfilment[fulfilment][lang]
  return orderStates.states[status][lang]
}

/** Whether the contract file's translations for this language have had native review. */
export const orderStatesReviewed: Readonly<Record<Lang, boolean>> = orderStates.reviewed
