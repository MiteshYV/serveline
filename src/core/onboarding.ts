/**
 * Build Spec §11: the ten onboarding steps the agent console tracks, and the stage a restaurant
 * has reached. Pure, so the restaurant list and the restaurant page cannot disagree.
 *
 * §4's `onboarding_checklist` table is deferred to M4 (M1 design, "Data model"), so at M1 four of
 * the ten steps are DERIVED from rows that already exist and the other six are shown greyed.
 * M4 replaces this derivation with that table, which carries a status and timestamp per step:
 * the titles below stay, the facts become rows, and `deriveChecklist` reads them instead.
 */

export type OnboardingFacts = {
  /** `outlet.created_at` of the oldest outlet, or null when the restaurant has none. */
  outletCreatedAt: Date | null
  /** The owner's `staff_user.last_login_at`: an OTP login is what verifies the phone. */
  ownerVerifiedAt: Date | null
  /** Latest `menu.published_at` across the restaurant's outlets. */
  menuPublishedAt: Date | null
  /** `outlet.hours` non-empty and a handoff number set; radius and COD carry defaults. */
  settingsConfigured: boolean
  /** Earliest `card_batch.placed_at`. */
  batchPlacedAt: Date | null
  /** Earliest `card_batch.placement_audited_at` among placed batches. */
  placementAuditedAt: Date | null
  /** Earliest `order.placed_at`. */
  firstOrderAt: Date | null
}

export type OnboardingStage = 'outlet' | 'menu' | 'cards' | 'first_order' | 'live'

export const ONBOARDING_STAGES: readonly OnboardingStage[] = ['outlet', 'menu', 'cards', 'first_order', 'live']

/** Hard-coded Latin system labels (design §4.2 permits these to be styled as such). */
export const STAGE_LABEL: Readonly<Record<OnboardingStage, string>> = {
  outlet: 'No outlet',
  menu: 'Menu unpublished',
  cards: 'Cards not placed',
  first_order: 'No orders yet',
  live: 'Taking orders',
}

/**
 * The first thing still missing, in the order a restaurant goes live: an outlet (§11 step 1), a
 * published menu (step 3), placed cards (step 7), then the first order — which is not a §11
 * step but is the point of the whole exercise (M1 design, "Purpose").
 */
export function onboardingStage(f: OnboardingFacts): OnboardingStage {
  if (!f.outletCreatedAt) return 'outlet'
  if (!f.menuPublishedAt) return 'menu'
  if (!f.batchPlacedAt) return 'cards'
  if (!f.firstOrderAt) return 'first_order'
  return 'live'
}

export type ChecklistStep = {
  n: number
  title: string
  state: 'done' | 'todo' | 'deferred'
  /** When the step completed, where a row carries the time; null when done but unstamped. */
  at: Date | null
  /** What is still missing (todo), or the caveat on a derived done (done). */
  note: string | null
}

/** Build Spec §11, verbatim, in order. */
export const CHECKLIST: readonly string[] = [
  'Restaurant and outlet created; owner phone verified.',
  'Razorpay linked account submitted; status tracked until active.',
  'Menu photographed, digitised, corrected, vocabulary generated and published.',
  "Virtual number provisioned; Exotel flow built; forwarding set on the restaurant's number; failover to owner mobile verified by pulling the voice service offline once.",
  'Hours, delivery radius, COD, handoff number configured.',
  'Test order on each channel: AI call in each language, table page, delivery page with a code.',
  'Card batch generated, printed, delivered and placed; placement audited at week 2.',
  'UPI Autopay mandate created.',
  'Two weeks of monitored calls: agent reviews every handoff and correction daily and adds vocabulary.',
  'First weekly aggregator count entered.',
]

/** Steps 1, 3, 5 and 7 from the facts; the rest deferred to the milestone that first writes them. */
export function deriveChecklist(f: OnboardingFacts): ChecklistStep[] {
  const step = (n: number, state: ChecklistStep['state'], at: Date | null, note: string | null): ChecklistStep =>
    ({ n, title: CHECKLIST[n - 1] ?? '', state, at, note })

  return [
    !f.outletCreatedAt
      ? step(1, 'todo', null, 'No outlet yet.')
      : f.ownerVerifiedAt
        ? step(1, 'done', f.ownerVerifiedAt, null)
        : step(1, 'todo', null, 'Outlet created; the owner has not yet signed in by OTP.'),
    step(2, 'deferred', null, null),
    f.menuPublishedAt
      ? step(3, 'done', f.menuPublishedAt, 'Vocabulary generation arrives with M4.')
      : step(3, 'todo', null, 'Menu not published.'),
    step(4, 'deferred', null, null),
    f.settingsConfigured
      // The outlet row has no change timestamp, so a derived "done" here cannot be dated.
      ? step(5, 'done', null, null)
      : step(5, 'todo', null, 'Hours or handoff number missing.'),
    step(6, 'deferred', null, null),
    f.batchPlacedAt
      ? step(7, 'done', f.batchPlacedAt, f.placementAuditedAt ? null : 'Placement audit pending.')
      : step(7, 'todo', null, 'No batch placed yet.'),
    step(8, 'deferred', null, null),
    step(9, 'deferred', null, null),
    step(10, 'deferred', null, null),
  ]
}
