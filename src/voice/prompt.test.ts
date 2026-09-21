import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  buildSystemPrompt, greetingFor, sanitiseCallerText, type ProfileSummary, type PromptOutlet,
} from './prompt.ts'

// The seeded outlet (src/db/seed.ts), as its Drizzle row arrives.
const outlet: PromptOutlet = {
  name: 'Kadamba Tiffin Room',
  area: 'Koramangala',
  hours: {
    mon: [['07:00', '15:30'], ['18:30', '22:30']],
    sat: [['07:00', '22:30']],
    sun: [],
  },
  holidayDates: ['2026-11-08'],
  deliveryRadiusKm: '4.0',
  serviceablePincodes: ['560034', '560095'],
  codEnabled: true,
  languages: ['hi', 'en', 'kn'],
}
const restaurant = { name: 'Kadamba Tiffin Room' }

// Monday 21 Sept 2026, 10:00 IST.
const mondayMorning = new Date('2026-09-21T04:30:00Z')

// What the loop has to hand for a returning customer: the full record, phone and door included.
// The summary it builds is the only thing the prompt receives; the test proves the rest never
// gets through — a type cannot prove that, because a wider object is assignable to a narrower one.
const priyaRecord = {
  phone: '+919876543210',
  phoneHash: 'a7167b374e083f402335b8dea54a073a33ddc8866e313425e4380f35fcf5d801',
  line1: 'Flat 302, Sai Krupa Apartments, 6th Cross, 4th Block',
  landmark: 'Opposite the Ganesha temple',
  firstName: 'Priya',
  usualOrder: [{ name: 'Masala Dosa', qty: 2 }, { name: 'Filter Coffee', qty: 2 }],
  usualOrderTotalPaise: 60_000,
  addressLabels: [{ id: 'addr-home', label: 'Home' }],
  allergies: ['peanut'],
  preferredLanguage: 'kn',
} satisfies ProfileSummary & Record<string, unknown>
const priya: ProfileSummary = priyaRecord

describe('buildSystemPrompt', () => {
  const prompt = buildSystemPrompt({ restaurant, outlet, profile: priya, lang: 'kn', now: mondayMorning, transport: 'browser' })

  it('carries no phone number and no address line (Build Spec §10)', () => {
    assert.doesNotMatch(prompt, /\d{10}/)
    assert.ok(!prompt.includes(priyaRecord.phone))
    assert.ok(!prompt.includes(priyaRecord.phoneHash))
    assert.ok(!prompt.includes(priyaRecord.line1))
    assert.ok(!prompt.includes(priyaRecord.landmark))
    assert.ok(!prompt.includes('Sai Krupa'))
  })

  it('has the §5.5 sections in order and ends with the language line', () => {
    const at = (needle: string) => {
      const i = prompt.indexOf(needle)
      assert.ok(i >= 0, `missing "${needle}"`)
      return i
    }
    const order = [
      at('You are the phone assistant for Kadamba Tiffin Room'),
      at('Languages: Hindi, English, Kannada'),
      at('Policies:'),
      at('Outlet:'),
      at('Caller: known'),
      at('Tools:'),
    ]
    assert.deepEqual(order, [...order].sort((a, b) => a - b))
    assert.ok(prompt.endsWith('\nLanguage: kn'))
    assert.ok(prompt.includes('Transport: browser'))
  })

  it('summarises the profile as labels and ids, with the usual order priced', () => {
    assert.ok(prompt.includes('First name: Priya'))
    assert.ok(prompt.includes('Usual order: Masala Dosa × 2, Filter Coffee × 2; ₹600 at today\'s prices'))
    assert.ok(prompt.includes('Home → addr-home'))
    assert.ok(prompt.includes('Allergies: peanut'))
    assert.ok(prompt.includes('Preferred language: Kannada'))
    // Allergies on record: the once-per-customer question is not asked again (Build Spec §5.2).
    assert.ok(!prompt.includes('Ask once'))
  })

  it('asks about allergies once for a caller with none on record', () => {
    const fresh = buildSystemPrompt({ restaurant, outlet, profile: null, lang: 'hi', now: mondayMorning, transport: 'exotel' })
    assert.ok(fresh.includes('Caller: new'))
    assert.ok(fresh.includes('Ask once, early in the order, whether the caller has any allergies'))
    assert.ok(fresh.endsWith('\nLanguage: hi'))
  })

  it('renders the outlet card for today in IST', () => {
    assert.ok(prompt.includes('Now: Monday 21 Sept 2026, 10:00 IST'))
    assert.ok(prompt.includes('Hours today: 07:00–15:30, 18:30–22:30'))
    assert.ok(prompt.includes('Holidays: 2026-11-08'))
    assert.ok(prompt.includes('Delivery: within 4.0 km; pincodes 560034, 560095'))
    assert.ok(prompt.includes('Cash on delivery: on'))

    // Sunday 20 Sept 2026 20:00 IST: an empty list means closed.
    const sunday = buildSystemPrompt({ restaurant, outlet, profile: null, lang: 'en', now: new Date('2026-09-20T14:30:00Z'), transport: 'browser' })
    assert.ok(sunday.includes('Hours today: closed today'))

    // Deepavali, and an outlet with no hours set and no COD.
    const holiday = buildSystemPrompt({
      restaurant,
      outlet: { ...outlet, hours: null, codEnabled: false },
      profile: null,
      lang: 'en',
      now: new Date('2026-11-08T05:00:00Z'),
      transport: 'browser',
    })
    assert.ok(holiday.includes('Hours today: closed today (holiday)'))
    assert.ok(holiday.includes('Cash on delivery: off'))
    const noHours = buildSystemPrompt({ restaurant, outlet: { ...outlet, hours: 'garbage' }, profile: null, lang: 'en', now: mondayMorning, transport: 'browser' })
    assert.ok(noHours.includes('Hours today: not on record'))
  })

  it('lists the thirteen tools from contracts/voice-tools.json', () => {
    for (const name of [
      'search_menu', 'add_to_cart', 'remove_from_cart', 'get_cart', 'apply_code', 'check_serviceability',
      'use_saved_address', 'capture_rough_address', 'send_sms', 'place_order', 'answer_enquiry',
      'transfer_to_human', 'end_call',
    ]) {
      assert.ok(prompt.includes(`\n- ${name}: `), `tool ${name} missing`)
    }
  })
})

describe('greetingFor', () => {
  it('greets a new telephone caller bilingually, with the recording notice (Build Spec §5.2)', () => {
    const g = greetingFor({ restaurant, lang: 'hi', profile: null, transport: 'exotel' })
    assert.equal(
      g,
      'नमस्ते, Kadamba Tiffin Room में आपका स्वागत है। यह कॉल क्वालिटी के लिए रिकॉर्ड होती है। क्या ऑर्डर करना चाहेंगे? '
      + 'Hello, welcome to Kadamba Tiffin Room. This call is recorded for quality. What would you like to order?',
    )
    // An English default still pairs Hindi with English; Kannada pairs with English.
    assert.ok(greetingFor({ restaurant, lang: 'en', profile: null, transport: 'exotel' }).startsWith('नमस्ते'))
    assert.ok(greetingFor({ restaurant, lang: 'kn', profile: null, transport: 'exotel' }).startsWith('ನಮಸ್ಕಾರ'))
  })

  it('greets a new browser caller in the page language only, with no recording notice', () => {
    const g = greetingFor({ restaurant, lang: 'en', profile: null, transport: 'browser' })
    assert.equal(g, 'Hello, welcome to Kadamba Tiffin Room. What would you like to order?')
    assert.doesNotMatch(g, /[ऀ-ॿಀ-೿]/)
  })

  it('offers a returning caller their usual order, in their preferred language only', () => {
    const g = greetingFor({ restaurant, lang: 'en', profile: priya, transport: 'browser' })
    assert.equal(g, 'ನಮಸ್ಕಾರ Priya, Kadamba Tiffin Roomಗೆ ಮತ್ತೆ ಸ್ವಾಗತ. ಕಳೆದ ಬಾರಿಯಂತೆಯೇ — 2 Masala Dosa, 2 Filter Coffee, ₹600?')
    assert.ok(!g.includes('.00'))
  })

  it('does not offer a usual order that no longer prices, or one that is empty', () => {
    const stale = greetingFor({ restaurant, lang: 'en', profile: { ...priya, preferredLanguage: 'en', usualOrderTotalPaise: null }, transport: 'exotel' })
    assert.equal(stale, 'Hello Priya, welcome back to Kadamba Tiffin Room. This call is recorded for quality. What would you like to order?')
    const none = greetingFor({ restaurant, lang: 'hi', profile: { ...priya, firstName: null, preferredLanguage: null, usualOrder: null }, transport: 'browser' })
    assert.equal(none, 'नमस्ते, Kadamba Tiffin Room में फिर से स्वागत है। क्या ऑर्डर करना चाहेंगे?')
  })
})

describe('sanitiseCallerText', () => {
  it('strips phone-shaped digit runs and keeps quantities', () => {
    assert.equal(sanitiseCallerText('call me on 9876543210 please'), 'call me on [number] please')
    assert.equal(sanitiseCallerText('my number is 98765 43210'), 'my number is [number]')
    // The country code is part of the same hyphenated run, so it goes too.
    assert.equal(sanitiseCallerText('+91-98765-43210'), '+[number]')
    assert.equal(sanitiseCallerText('pincode 560034'), 'pincode [number]')
    assert.equal(sanitiseCallerText('2 dosa and 3 coffee, table 12'), '2 dosa and 3 coffee, table 12')
    assert.equal(sanitiseCallerText('code WELCOME10 for 12345'), 'code WELCOME10 for 12345')
  })
})
