import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { brandStyle, contrast, normaliseBrand, oklch } from './brand.ts'

/** Design §3.5: the twelve hostile inputs. Gate 4 in §13: every triple ≥ 4.5:1 on every change. */
const HOSTILE: [string, string][] = [
  ['neon lime', '#B6FF00'],
  ['near-black maroon', '#2B0A0F'],
  ['bright yellow', '#FFD600'],
  ['mid blue', '#1E5AA8'],
  ['hot pink', '#FF2D8E'],
  ['pure white', '#FFFFFF'],
  ['pure black', '#000000'],
  ['muddy olive', '#6B6B2E'],
  ['saffron', '#FF9933'],
  ['india green', '#138808'],
  ['cyan', '#00E5FF'],
  ['deep purple', '#4A148C'],
]

const hueDistance = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b))

describe('normaliseBrand', () => {
  for (const [name, hex] of HOSTILE) {
    it(`${name} ${hex}: every pair clears AA in both themes`, () => {
      const b = normaliseBrand(hex)
      assert.ok(contrast(b.on, b.fill) >= 4.5, `on/fill ${contrast(b.on, b.fill).toFixed(2)}`)
      assert.ok(contrast(b.ink, '#FFFFFF') >= 4.5, `ink/white ${contrast(b.ink, '#FFFFFF').toFixed(2)}`)
      assert.ok(contrast(b.ink, '#F6F8F9') >= 4.5, `ink/steel-025 ${contrast(b.ink, '#F6F8F9').toFixed(2)}`)
      assert.ok(contrast(b.onDark, b.fillDark) >= 4.5, `dark on/fill ${contrast(b.onDark, b.fillDark).toFixed(2)}`)
      for (const ground of ['#0F171B', '#192227', '#28333A']) {
        assert.ok(contrast(b.inkDark, ground) >= 4.5, `dark ink on ${ground} ${contrast(b.inkDark, ground).toFixed(2)}`)
      }
    })
  }

  it('preserves hue for a chromatic brand', () => {
    for (const [, hex] of HOSTILE) {
      const { C, H } = oklch(hex)
      if (C < 0.05) continue
      const b = normaliseBrand(hex)
      for (const out of [b.fill, b.ink, b.fillDark, b.inkDark]) {
        const o = oklch(out)
        if (o.C < 0.04) continue // too grey for hue to mean anything
        assert.ok(hueDistance(o.H, H) < 4, `${hex} → ${out}: hue ${H.toFixed(1)} became ${o.H.toFixed(1)}`)
      }
    }
  })

  it('turns an achromatic brand into steel, not a colour', () => {
    for (const hex of ['#FFFFFF', '#000000']) {
      const b = normaliseBrand(hex)
      assert.ok(oklch(b.fill).C < 0.005, `${hex} fill ${b.fill} has chroma`)
      assert.ok(oklch(b.ink).C < 0.005, `${hex} ink ${b.ink} has chroma`)
    }
  })

  it('matches the §3.5 table on the mid-blue reference within rounding', () => {
    const b = normaliseBrand('#1E5AA8')
    assert.ok(contrast(b.on, b.fill) >= 4.5 && contrast(b.on, b.fill) < 5.6)
    assert.equal(b.on, '#FFFFFF')
  })

  it('emits the four tokens for both themes and never the raw hex', () => {
    const css = brandStyle(normaliseBrand('#B6FF00'))
    assert.ok(!css.includes('#B6FF00'))
    for (const token of ['--brand-fill', '--brand-on', '--brand-ink', '--brand-wash']) {
      assert.equal(css.split(token).length - 1, 3, `${token} once per theme block`)
    }
    assert.ok(css.includes('prefers-color-scheme:dark'))
  })

  it('rejects anything that is not a six-digit hex', () => {
    assert.throws(() => normaliseBrand('red'))
    assert.throws(() => normaliseBrand('#FFF'))
  })
})
