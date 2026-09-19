'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * The new-order chime (design §8, ADR 0002 §5): a placeholder two-tone from a Web Audio
 * oscillator — no audio file, nothing to download. Browsers only start audio after a user
 * gesture, so the operator taps "Tap to enable order sounds" once; the choice persists in
 * localStorage and, on later loads, the first tap anywhere on the page re-arms the context.
 */
const KEY = 'sl_sound'

function chime(ctx: AudioContext) {
  const t0 = ctx.currentTime
  for (const [hz, at] of [[880, 0], [1174.66, 0.16]] as const) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = hz
    gain.gain.setValueAtTime(0.0001, t0 + at)
    gain.gain.exponentialRampToValueAtTime(0.5, t0 + at + 0.015)
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + at + 0.15)
    osc.connect(gain).connect(ctx.destination)
    osc.start(t0 + at)
    osc.stop(t0 + at + 0.17)
  }
}

export function useOrderSound() {
  const [enabled, setEnabled] = useState(false)
  const ctxRef = useRef<AudioContext | null>(null)

  const arm = useCallback(() => {
    if (typeof AudioContext === 'undefined') return null
    const ctx = (ctxRef.current ??= new AudioContext())
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  }, [])

  useEffect(() => {
    let on = false
    try {
      on = localStorage.getItem(KEY) === 'on'
    } catch {
      /* private mode or blocked storage: sounds stay off until tapped */
    }
    setEnabled(on)
    if (!on) return
    // Re-arm on the first gesture of the shift; the listener removes itself.
    const once = () => {
      arm()
      document.removeEventListener('pointerdown', once)
    }
    document.addEventListener('pointerdown', once)
    return () => document.removeEventListener('pointerdown', once)
  }, [arm])

  const enable = useCallback(() => {
    const ctx = arm()
    if (ctx) chime(ctx) // audible confirmation, and the volume test the design asks for
    try {
      localStorage.setItem(KEY, 'on')
    } catch {
      /* fine: on for this page load */
    }
    setEnabled(true)
  }, [arm])

  const disable = useCallback(() => {
    try {
      localStorage.setItem(KEY, 'off')
    } catch {
      /* ignore */
    }
    setEnabled(false)
  }, [])

  const play = useCallback(() => {
    if (!enabled) return
    const ctx = ctxRef.current
    if (ctx && ctx.state === 'running') chime(ctx)
  }, [enabled])

  return { enabled, enable, disable, play }
}
