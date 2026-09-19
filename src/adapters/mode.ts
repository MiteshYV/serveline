/**
 * Which implementation every adapter selects. CLAUDE.md: mocks are chosen explicitly by
 * `VENDOR_MODE=mock`; a live mode with a missing variable is an error, never a quiet mock.
 * `mock` is the default because no vendor account exists at M1 (.env.example, M1 design §"Build mode").
 */
export function vendorMode(): 'mock' | 'live' {
  const mode = process.env.VENDOR_MODE ?? 'mock'
  if (mode === 'mock' || mode === 'live') return mode
  throw new Error(`VENDOR_MODE must be "mock" or "live", received "${mode}"`)
}
