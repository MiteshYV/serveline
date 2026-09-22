/**
 * Finding negative-unit-price-cart, at the form. `upsertItem` is the guarantee — it refuses the
 * whole row — but it can only return one sentence, and the editor needs the reason under the input
 * that caused it. A separate file from itemForm.test.ts so the fixture stays that file's.
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseItemForm } from './itemForm.ts'

const CAT = '0b2d5a3e-1f4c-4d8e-9a6b-7c1d2e3f4a5b'

const form = (entries: Record<string, string>) => {
  const fd = new FormData()
  for (const [k, v] of Object.entries(entries)) fd.set(k, v)
  return fd
}

const base = {
  categoryId: CAT,
  name: 'Chicken Biryani',
  description: '',
  pricePaise: '100',
  spiceLevel: 'medium',
  isAvailable: 'on',
  sort: '0',
  allergens: '',
  tags: '',
}

describe('parseItemForm price floor', () => {
  it('refuses a variant delta larger than the base price, under that input', () => {
    const r = parseItemForm(form({
      ...base,
      'variants[0].name': 'Half',
      'variants[0].priceDeltaPaise': '-150',
    }))

    assert.equal(r.ok, false)
    assert.ok(!r.ok && /below zero/.test(r.errors['variants[0].priceDeltaPaise'] ?? ''))
  })

  it('refuses an option delta larger than the base price, under that input', () => {
    const r = parseItemForm(form({
      ...base,
      'groups[0].name': 'Leave out',
      'groups[0].minSelect': '0',
      'groups[0].maxSelect': '1',
      'groups[0].options[0].name': 'No rice',
      'groups[0].options[0].priceDeltaPaise': '-150',
    }))

    assert.equal(r.ok, false)
    assert.ok(!r.ok && /below zero/.test(r.errors['groups[0].options[0].priceDeltaPaise'] ?? ''))
  })

  it('still accepts a negative delta that leaves the price at or above zero', () => {
    const r = parseItemForm(form({
      ...base,
      pricePaise: '240',
      'variants[0].name': 'Half',
      'variants[0].priceDeltaPaise': '-80',
    }))

    assert.equal(r.ok, true)
    assert.equal(r.ok && r.input.variants?.[0]?.priceDeltaPaise, -8000)
  })
})
