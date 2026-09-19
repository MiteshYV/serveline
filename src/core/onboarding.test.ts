import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { CHECKLIST, deriveChecklist, onboardingStage, type OnboardingFacts } from './onboarding.ts'

const d = (day: number) => new Date(Date.UTC(2026, 8, day))

const none: OnboardingFacts = {
  outletCreatedAt: null,
  ownerVerifiedAt: null,
  menuPublishedAt: null,
  settingsConfigured: false,
  batchPlacedAt: null,
  placementAuditedAt: null,
  firstOrderAt: null,
}

const live: OnboardingFacts = {
  outletCreatedAt: d(1),
  ownerVerifiedAt: d(2),
  menuPublishedAt: d(3),
  settingsConfigured: true,
  batchPlacedAt: d(4),
  placementAuditedAt: null,
  firstOrderAt: d(5),
}

describe('onboardingStage', () => {
  it('walks the ladder in order: outlet, menu, cards, first order, live', () => {
    assert.equal(onboardingStage(none), 'outlet')
    assert.equal(onboardingStage({ ...none, outletCreatedAt: d(1) }), 'menu')
    assert.equal(onboardingStage({ ...none, outletCreatedAt: d(1), menuPublishedAt: d(3) }), 'cards')
    assert.equal(onboardingStage({ ...live, firstOrderAt: null }), 'first_order')
    assert.equal(onboardingStage(live), 'live')
  })

  it('an order does not skip the ladder: cards still unplaced means cards', () => {
    assert.equal(onboardingStage({ ...live, batchPlacedAt: null }), 'cards')
  })
})

describe('deriveChecklist', () => {
  it('has all ten §11 steps, in order, and only 1/3/5/7 are ever derivable', () => {
    const steps = deriveChecklist(live)
    assert.equal(steps.length, 10)
    assert.deepEqual(steps.map((s) => s.n), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    assert.deepEqual(steps.map((s) => s.title), CHECKLIST)
    assert.deepEqual(steps.filter((s) => s.state === 'deferred').map((s) => s.n), [2, 4, 6, 8, 9, 10])
  })

  it('stamps the derived steps from the row that completed them', () => {
    const by = new Map(deriveChecklist(live).map((s) => [s.n, s]))
    assert.equal(by.get(1)?.state, 'done')
    assert.equal(by.get(1)?.at?.getTime(), d(2).getTime()) // the owner's OTP login, not the outlet's creation
    assert.equal(by.get(3)?.at?.getTime(), d(3).getTime())
    assert.equal(by.get(5)?.state, 'done')
    assert.equal(by.get(5)?.at, null) // outlet has no change timestamp
    assert.equal(by.get(7)?.at?.getTime(), d(4).getTime())
    assert.match(by.get(7)?.note ?? '', /audit pending/)
  })

  it('an outlet whose owner has never logged in leaves step 1 open and says why', () => {
    const one = deriveChecklist({ ...none, outletCreatedAt: d(1) })[0]
    assert.equal(one?.state, 'todo')
    assert.match(one?.note ?? '', /not yet signed in/)
  })
})
