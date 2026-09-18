import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { checkServiceability } from './serviceability.ts'
import type { OutletServiceArea } from './serviceability.ts'

const outlet: OutletServiceArea = {
  area: 'Indiranagar',
  serviceablePincodes: ['560038', '560008'],
}

describe('checkServiceability', () => {
  it('accepts a pincode on the outlet list', () => {
    assert.deepEqual(checkServiceability({ pincode: '560038' }, outlet), { ok: true })
  })

  it('ignores the spaces customers type into a pincode field', () => {
    assert.deepEqual(checkServiceability({ pincode: ' 560 038 ' }, outlet), { ok: true })
  })

  it('ignores spaces stored in the outlet settings', () => {
    const untidy: OutletServiceArea = { ...outlet, serviceablePincodes: ['560 038'] }
    assert.deepEqual(checkServiceability({ pincode: '560038' }, untidy), { ok: true })
  })

  it('refuses a pincode off the list', () => {
    const result = checkServiceability({ pincode: '560100' }, outlet)
    assert.deepEqual(result, { ok: false, reason: 'pincode_not_served' })
  })

  it('refuses everything when no pincodes are configured', () => {
    const unconfigured: OutletServiceArea = { ...outlet, serviceablePincodes: [] }
    const result = checkServiceability({ pincode: '560038' }, unconfigured)
    assert.deepEqual(result, { ok: false, reason: 'pincode_not_served' })
  })

  // Build Spec §5.2: a voice order has an area and a landmark and no pincode.
  it('accepts a matching area regardless of case and spacing', () => {
    assert.deepEqual(checkServiceability({ area: '  indira  nagar' }, {
      ...outlet,
      area: 'Indira Nagar',
    }), { ok: true })
  })

  it('refuses an area the outlet does not cover', () => {
    const result = checkServiceability({ area: 'Whitefield' }, outlet)
    assert.deepEqual(result, { ok: false, reason: 'area_not_served' })
  })

  it('lets an unserved pincode decide even when the area matches', () => {
    const result = checkServiceability({ pincode: '560100', area: 'Indiranagar' }, outlet)
    assert.deepEqual(result, { ok: false, reason: 'pincode_not_served' })
  })

  it('refuses when neither a pincode nor an area has been given yet', () => {
    assert.deepEqual(checkServiceability({}, outlet), { ok: false, reason: 'no_location_given' })
    assert.deepEqual(
      checkServiceability({ pincode: '  ', area: '  ' }, outlet),
      { ok: false, reason: 'no_location_given' },
    )
  })
})
