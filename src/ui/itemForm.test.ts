import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseINR } from '../core/money.ts'
import { paiseToInput, parseItemForm } from './itemForm.ts'

const CAT = '0b2d5a3e-1f4c-4d8e-9a6b-7c1d2e3f4a5b'
const VAR = '1c3e6b4f-2a5d-4e9f-8b7c-6d2e3f4a5b6c'

const form = (entries: Record<string, string>) => {
  const fd = new FormData()
  for (const [k, v] of Object.entries(entries)) fd.set(k, v)
  return fd
}

const base = {
  categoryId: CAT,
  name: 'Paneer Butter Masala',
  description: '',
  pricePaise: '240',
  spiceLevel: 'mild',
  isAvailable: 'on',
  sort: '3',
  allergens: 'dairy, nuts',
  tags: '',
}

describe('parseINR', () => {
  it('reads rupees as integer paise, including negatives and the rupee sign', () => {
    assert.equal(parseINR('240'), 24000)
    assert.equal(parseINR('240.5'), 24050)
    assert.equal(parseINR('₹1,200.00'), 120000)
    assert.equal(parseINR('-90'), -9000)
    assert.equal(parseINR('0.07'), 7)
  })
  it('refuses anything that is not money', () => {
    for (const bad of ['', 'abc', '1.234', '1e3', '1.2.3']) assert.throws(() => parseINR(bad), TypeError)
  })
  it('round-trips through paiseToInput', () => {
    for (const p of [0, 7, 24050, -9000, 120000]) assert.equal(parseINR(paiseToInput(p)), p)
  })
})

describe('parseItemForm', () => {
  it('builds an UpsertItemInput with paise, skipping blank rows and dropping removed ones', () => {
    const r = parseItemForm(form({
      ...base,
      'variants[0].id': VAR, 'variants[0].name': 'Half', 'variants[0].priceDeltaPaise': '-90',
      'variants[1].name': 'Full', 'variants[1].priceDeltaPaise': '0',
      'variants[2].name': '', 'variants[2].priceDeltaPaise': '',            // blank row
      'variants[3].name': 'Jumbo', 'variants[3].priceDeltaPaise': '50', 'variants[3].remove': 'on',
      'groups[0].name': 'Extras', 'groups[0].minSelect': '0', 'groups[0].maxSelect': '2',
      'groups[0].options[0].name': 'Extra ghee', 'groups[0].options[0].priceDeltaPaise': '15',
      'groups[0].options[1].name': '', 'groups[0].options[1].priceDeltaPaise': '',
      'groups[1].name': '', 'groups[1].minSelect': '0', 'groups[1].maxSelect': '1',    // blank group
      'groups[1].options[0].name': '', 'groups[1].options[0].priceDeltaPaise': '',
    }))
    assert.ok(r.ok, JSON.stringify(r))
    assert.equal(r.input.id, undefined)
    assert.equal(r.input.pricePaise, 24000)
    assert.equal(r.input.isVeg, false)
    assert.equal(r.input.isAvailable, true)
    assert.deepEqual(r.input.allergens, ['dairy', 'nuts'])
    assert.equal(r.input.description, null)
    assert.deepEqual(r.input.variants, [
      { id: VAR, name: 'Half', priceDeltaPaise: -9000 },
      { id: undefined, name: 'Full', priceDeltaPaise: 0 },
    ])
    assert.deepEqual(r.input.optionGroups, [
      { id: undefined, name: 'Extras', minSelect: 0, maxSelect: 2, options: [{ id: undefined, name: 'Extra ghee', priceDeltaPaise: 1500 }] },
    ])
  })

  it('keys errors by the input name so the form can place them', () => {
    const r = parseItemForm(form({
      ...base,
      name: '',
      pricePaise: 'two forty',
      'variants[0].name': 'Half', 'variants[0].priceDeltaPaise': 'x',
      'groups[0].name': 'Served with', 'groups[0].minSelect': '2', 'groups[0].maxSelect': '1',
      'groups[0].options[0].name': 'Raita', 'groups[0].options[0].priceDeltaPaise': '0',
    }))
    assert.ok(!r.ok)
    assert.equal(r.errors['name'], 'Required')
    assert.match(r.errors['pricePaise'] ?? '', /rupees/)
    assert.match(r.errors['variants[0].priceDeltaPaise'] ?? '', /rupees/)
    assert.equal(r.errors['categoryId'], undefined)
  })

  it('refuses a group with no options and max below min, after the field checks pass', () => {
    const r = parseItemForm(form({
      ...base,
      'groups[0].name': 'Served with', 'groups[0].minSelect': '2', 'groups[0].maxSelect': '1',
      'groups[0].options[0].name': '', 'groups[0].options[0].priceDeltaPaise': '',
    }))
    assert.ok(!r.ok)
    assert.match(r.errors['groups[0].name'] ?? '', /at least one option/)
    assert.match(r.errors['groups[0].maxSelect'] ?? '', /at least min/)
  })
})
