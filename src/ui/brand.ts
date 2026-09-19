/**
 * The restaurant brand-colour normaliser — design §3.5, maths from §13.
 *
 * A raw brand hex never reaches the DOM (design §11.2). It goes through this once per render of
 * the customer page and comes out as four tokens per theme whose every pair clears WCAG 2.2 AA.
 * Hue is preserved; only lightness and chroma are constrained, so the restaurant still
 * recognises its colour. Achromatic input (white, black, grey) has no hue and becomes steel —
 * §3.5 says that is correct and not to "fix" it.
 *
 * Pure: no DOM, no framework. brand.test.ts runs the twelve hostile inputs from the §3.5 table.
 */

export type BrandTokens = {
  fill: string
  on: string
  ink: string
  wash: string
  fillDark: string
  onDark: string
  inkDark: string
  washDark: string
}

type Rgb = [number, number, number] // 8-bit sRGB

// ---- sRGB ↔ OKLCH (Björn Ottosson's matrices, design §13) --------------------------------------

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const toGamma = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055)

function parseHex(hex: string): Rgb {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) throw new Error(`Brand colour must be a six-digit hex, received "${hex}"`)
  const n = Number.parseInt(m[1]!, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

const toHex = ([r, g, b]: Rgb) =>
  `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`.toUpperCase()

function rgbToOklch([r8, g8, b8]: Rgb): [number, number, number] {
  const r = toLinear(r8 / 255), g = toLinear(g8 / 255), b = toLinear(b8 / 255)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  const C = Math.hypot(a, bb)
  const H = ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360
  return [L, C, H]
}

/** Linear sRGB, unclamped, so the caller can tell whether the triple is inside the gamut. */
function oklchToLinear(L: number, C: number, H: number): [number, number, number] {
  const a = C * Math.cos((H * Math.PI) / 180), b = C * Math.sin((H * Math.PI) / 180)
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
}

/** §13: reduce chroma in 0.005 steps until the triple maps inside sRGB, then quantise. */
function oklchToRgb(L: number, C: number, H: number): Rgb {
  let c = C
  let lin = oklchToLinear(L, c, H)
  const inGamut = (v: number[]) => v.every((x) => x >= -1e-6 && x <= 1 + 1e-6)
  while (!inGamut(lin) && c > 0) {
    c = Math.max(0, c - 0.005)
    lin = oklchToLinear(L, c, H)
  }
  return lin.map((x) => Math.round(toGamma(Math.min(1, Math.max(0, x))) * 255)) as Rgb
}

// ---- WCAG contrast --------------------------------------------------------------------------

const luminance = ([r, g, b]: Rgb) =>
  0.2126 * toLinear(r / 255) + 0.7152 * toLinear(g / 255) + 0.0722 * toLinear(b / 255)

export function contrast(a: string, b: string): number {
  const la = luminance(parseHex(a)), lb = luminance(parseHex(b))
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

export function oklch(hex: string): { L: number; C: number; H: number } {
  const [L, C, H] = rgbToOklch(parseHex(hex))
  return { L, C, H }
}

// ---- the normaliser -------------------------------------------------------------------------

const AA = 4.5
const WHITE = '#FFFFFF'
const STEEL_900 = '#192227'
const STEEL_025 = '#F6F8F9'
const DARK_GROUNDS = ['#0F171B', '#192227', '#28333A'] as const

/**
 * Walk L from `start` in steps of 0.01 in `direction` until `ok` accepts the quantised colour.
 * The check runs on the 8-bit result, not the float, so what ships is what passed.
 */
function walk(
  H: number,
  C: number,
  start: number,
  direction: 1 | -1,
  ok: (hex: string) => boolean,
  floor = 0,
): string | null {
  for (let L = start; L >= floor && L <= 1; L += direction * 0.01) {
    const hex = toHex(oklchToRgb(L, C, H))
    if (ok(hex)) return hex
  }
  return null
}

export function normaliseBrand(rawHex: string): BrandTokens {
  const [, C0, H] = rgbToOklch(parseHex(rawHex))

  // brand-fill: white on it at ≥4.5. Very yellow/lime hues that cannot get there by L ≥ 0.30
  // flip to a pale fill with steel-900 text instead (§3.5).
  let fill = walk(H, Math.min(C0, 0.16), 0.55, -1, (hex) => contrast(WHITE, hex) >= AA, 0.30)
  let on = WHITE
  if (!fill) {
    fill = walk(H, Math.min(C0, 0.16), 0.86, 1, (hex) => contrast(STEEL_900, hex) >= AA) ?? WHITE
    on = STEEL_900
  }

  const ink = walk(
    H, Math.min(C0, 0.14), 0.52, -1,
    (hex) => contrast(hex, WHITE) >= AA && contrast(hex, STEEL_025) >= AA,
  ) ?? STEEL_900

  const wash = toHex(oklchToRgb(0.965, Math.min(C0, 0.035), H))

  const fillDark = walk(H, Math.min(C0, 0.13), 0.46, -1, (hex) => contrast(WHITE, hex) >= AA) ?? STEEL_900
  const inkDark = walk(
    H, Math.min(C0, 0.12), 0.72, 1,
    (hex) => DARK_GROUNDS.every((ground) => contrast(hex, ground) >= AA),
  ) ?? WHITE
  const washDark = toHex(oklchToRgb(0.24, Math.min(C0, 0.05), H))

  return { fill, on, ink, wash, fillDark, onDark: WHITE, inkDark, washDark }
}

/**
 * The inline <style> for the customer page head (design §10): the four tokens, light and dark,
 * scoped to `[data-brand]` so they outrank tokens.css's `:root` fallbacks in every cascade
 * order. Dark follows tokens.css's own two selectors (ADR 0002 §3: the customer surface follows
 * the OS; a manual `data-theme` still wins).
 */
export function brandStyle(tokens: BrandTokens): string {
  const light = `--brand-fill:${tokens.fill};--brand-on:${tokens.on};--brand-ink:${tokens.ink};--brand-wash:${tokens.wash}`
  const dark = `--brand-fill:${tokens.fillDark};--brand-on:${tokens.onDark};--brand-ink:${tokens.inkDark};--brand-wash:${tokens.washDark}`
  return (
    `[data-brand]{${light}}`
    + `:root[data-theme="dark"] [data-brand]{${dark}}`
    + `@media (prefers-color-scheme:dark){:root:not([data-theme="light"]) [data-brand]{${dark}}}`
  )
}
