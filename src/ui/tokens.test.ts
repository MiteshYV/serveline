import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * ADR 0002 §3 gives dark mode two ways in: the manual toggle writes `[data-theme="dark"]`, and a
 * dark OS applies unless the user has explicitly chosen light. CSS cannot share one declaration
 * block between a plain selector and a media query, so tokens.css writes the dark palette twice.
 *
 * That is the hazard these tests exist for. Change one block, forget the other, and dark mode
 * silently differs depending on *how* it was switched on — a bug nobody reports, because whoever
 * finds it only ever activates dark one way.
 */

const css = readFileSync(join(process.cwd(), 'src', 'ui', 'tokens.css'), 'utf8')

/** Every `--name: value` in a block, comments and whitespace stripped. */
function declarations(block: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const [, name, value] of block.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    out.set(name!, value!.trim().replace(/\s+/g, ' '))
  }
  return out
}

/** The body of the first rule whose selector line matches, brace-counted so nesting is safe. */
function ruleBody(source: string, selector: RegExp): string {
  const at = source.search(selector)
  assert.notEqual(at, -1, `tokens.css no longer contains a rule matching ${selector}`)
  const open = source.indexOf('{', at)
  let depth = 0
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++
    else if (source[i] === '}' && --depth === 0) return source.slice(open + 1, i)
  }
  throw new Error(`unbalanced braces after ${selector}`)
}

const manual = declarations(ruleBody(css, /:root\[data-theme=["']dark["']\]\s*\{/))
const os = declarations(ruleBody(ruleBody(css, /@media\s*\(prefers-color-scheme:\s*dark\)/), /:root:not\(\[data-theme=["']light["']\]\)\s*\{/))

test('the two dark blocks define exactly the same tokens', () => {
  assert.deepEqual(
    [...os.keys()].sort(),
    [...manual.keys()].sort(),
    'a token is themed under one dark trigger but not the other, so dark mode differs depending on whether it came from the toggle or the OS',
  )
})

test('the two dark blocks give every token the same value', () => {
  const differing = [...manual].filter(([name, value]) => os.has(name) && os.get(name) !== value)
  assert.deepEqual(
    differing.map(([name, value]) => `${name}: ${value} (manual) vs ${os.get(name)} (OS)`),
    [],
  )
})

/** Relative luminance, WCAG 2.2 §relative-luminance. */
function luminance(hex: string): number {
  const h = hex.replace('#', '')
  const channels = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
  const linear = channels.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

/** Follow a `var(--x)` chain until it reaches a literal colour. */
function resolve(palette: Map<string, string>, name: string): string | null {
  let value = palette.get(name)
  for (let hops = 0; value && hops < 10; hops++) {
    if (value.startsWith('#')) return value
    const ref = /^var\((--[\w-]+)\)$/.exec(value)
    if (!ref) return null
    value = palette.get(ref[1]!)
  }
  return null
}

const lightPalette = declarations(ruleBody(css, /^:root\s*\{/m))
const darkPalette = new Map([...lightPalette, ...manual])
const THEMES: [string, Map<string, string>][] = [['light', lightPalette], ['dark', darkPalette]]

const LOUD_STATES = ['received', 'preparing', 'ready', 'attention']

/**
 * Design §13 names contrast gates "to enforce in CI". Nothing enforced them, and the gap let the
 * dark plates ship at 1.64–2.03:1 against the card they sit on: a filled chip that reads as bold
 * enamel in light was a barely-there tint in dark, in both themes' own documented palette.
 */
test('§13 gate: the word on a filled state plate clears 4.5:1, in both themes', () => {
  const failures: string[] = []
  for (const [theme, palette] of THEMES) {
    for (const state of [...LOUD_STATES, 'delivered', 'cancelled']) {
      const plate = resolve(palette, `--state-${state}-plate`)
      const on = resolve(palette, `--state-${state}-on`)
      if (!plate || !on) { failures.push(`${theme}/${state}: token missing or unresolvable`); continue }
      const ratio = contrast(on, plate)
      if (ratio < 4.5) failures.push(`${theme}/${state}: ${on} on ${plate} = ${ratio.toFixed(2)}:1, needs 4.5`)
    }
  }
  assert.deepEqual(failures, [])
})

/**
 * SC 1.4.11: seeing that the chip *is* a chip. Delivered and cancelled are exempt by law rather
 * than by oversight — "delivered returns to steel" makes them recede on purpose, and their word
 * carries 9.57:1 and 10.35:1, which is what identifies them.
 */
test('§13 gate: a filled state plate clears 3:1 against the card it sits on, in both themes', () => {
  const failures: string[] = []
  for (const [theme, palette] of THEMES) {
    const card = resolve(palette, '--bg-card')!
    for (const state of LOUD_STATES) {
      const plate = resolve(palette, `--state-${state}-plate`)!
      const ratio = contrast(plate, card)
      if (ratio < 3) failures.push(`${theme}/${state}: plate ${plate} on card ${card} = ${ratio.toFixed(2)}:1, needs 3`)
    }
  }
  assert.deepEqual(failures, [])
})

/**
 * A text role is only as good as the ground it lands on, and §3.1 measured each role once — on the
 * card. --text-primary and --text-secondary survive that generalisation. They are asserted here on
 * every surface token, in both themes.
 */
test('§13 gate: primary and secondary text clear 4.5:1 on every ground, in both themes', () => {
  const failures: string[] = []
  for (const [theme, palette] of THEMES) {
    for (const role of ['--text-primary', '--text-secondary']) {
      const ink = resolve(palette, role)!
      for (const ground of ['--bg-app', '--bg-card', '--bg-raised', '--bg-sunken']) {
        const bg = resolve(palette, ground)!
        const ratio = contrast(ink, bg)
        if (ratio < 4.5) failures.push(`${theme}: ${role} ${ink} on ${ground} ${bg} = ${ratio.toFixed(2)}:1`)
      }
    }
  }
  assert.deepEqual(failures, [])
})

/**
 * --text-tertiary does not survive it, and cannot be made to.
 *
 * In light it clears 4.5:1 on the card (4.69) and fails on --bg-app (4.13) and --bg-sunken (3.76).
 * The only step in the steel ramp that clears every light ground is steel-600 — which is already
 * --text-secondary. In dark the only step that clears every ground is steel-300, which is already
 * --text-secondary there. So there is no value for this role that is both universal and distinct
 * from the role above it: the ramp has no room between "readable anywhere" and "too light".
 *
 * That makes card-only a property of the role rather than a defect in it. This test pins the
 * ground it is valid on, so the restriction is enforced rather than remembered.
 */
test('§13 gate: --text-tertiary is card-only, and clears 4.5:1 there in both themes', () => {
  const failures: string[] = []
  for (const [theme, palette] of THEMES) {
    const ink = resolve(palette, '--text-tertiary')!
    const card = resolve(palette, '--bg-card')!
    const ratio = contrast(ink, card)
    if (ratio < 4.5) failures.push(`${theme}: --text-tertiary ${ink} on --bg-card ${card} = ${ratio.toFixed(2)}:1`)
  }
  assert.deepEqual(failures, [])
})

/**
 * The persistent bottom CTA bar is the one surface that must stay a dark plate in BOTH themes.
 * It used --bg-inverse, which did exactly what "inverse" promises and turned into a near-white
 * slab across the bottom of a dark phone. In dark the bar sits only 1.4:1 above the page, so the
 * seam is not decoration — it is what makes it read as a plate at all.
 */
test('§13 gate: the cart bar stays a dark plate with a legible word and a real seam', () => {
  const failures: string[] = []
  for (const [theme, palette] of THEMES) {
    const fill = resolve(palette, '--bar-fill')!
    const on = resolve(palette, '--bar-on')!
    const word = contrast(on, fill)
    if (word < 4.5) failures.push(`${theme}: --bar-on on --bar-fill = ${word.toFixed(2)}:1, needs 4.5`)

    const page = resolve(palette, '--bg-app')!
    const edge = resolve(palette, '--bar-edge')
    const plate = contrast(fill, page)
    // Light gets its separation from the plate itself; dark needs the edge to supply it.
    if (plate < 3) {
      if (!edge) failures.push(`${theme}: bar is ${plate.toFixed(2)}:1 on the page and has no --bar-edge to separate it`)
      else {
        const seam = contrast(edge, fill)
        if (seam < 3) failures.push(`${theme}: bar is ${plate.toFixed(2)}:1 on the page and its seam is only ${seam.toFixed(2)}:1`)
      }
    }
  }
  assert.deepEqual(failures, [])
})

test('dark re-points every role the light palette defines', () => {
  const light = declarations(ruleBody(css, /^:root\s*\{/m))

  // The steel ramp is the raw material and is the same in both themes — dark re-points the roles
  // that read it, which is why the design doc says not to pair by ramp number. Type, space, radius,
  // motion and touch targets are theme-independent by design.
  const themeIndependent = /^--(steel|fs|fw|lh|text-(display|title|subtitle|body|label|caption)$|font|space|radius|dur|ease|touch|row)/

  // --scrim is deliberately one value in both themes. It mixes towards --steel-950, which is the
  // darkest step in a ramp that does not move, and its job is the same either way: suppress
  // whatever is bright behind a dialog. In light that is a white card; in dark it is steel-800 and
  // steel-100 text. Re-pointing it would mean finding something darker than the darkest step.
  const CONSTANT_BY_DESIGN = new Set(['--scrim'])

  const unthemed = [...light]
    .filter(([name]) => !themeIndependent.test(name) && !manual.has(name) && name !== '--color-scheme')
    .filter(([name]) => !CONSTANT_BY_DESIGN.has(name))
    // A role that resolves to another role follows it. A role whose light value is `none` —
    // --elev-0 — has no colour to re-point in the first place.
    .filter(([, value]) => value !== 'none' && !value.startsWith('var('))
    .map(([name]) => name)

  assert.deepEqual(
    unthemed,
    [],
    'these roles carry a colour in light but are never re-pointed for dark, so they keep their light value on a dark background',
  )
})
