'use client'

import { useState } from 'react'
import { normaliseBrand } from '@/ui/brand.ts'
import { Field } from '@/ui/Field.tsx'
import c from '../../../console.module.css'

const HEX = /^#[0-9a-fA-F]{6}$/

/**
 * Design §3.5: the agent console's one permitted brand-colour surface is "a swatch preview
 * inside the brand-config field". The swatches are the NORMALISED tokens from src/ui/brand.ts;
 * the raw hex is stored as data and never painted (§11.2). No colour picker, for the same reason:
 * its native swatch would paint the raw value.
 */
export function BrandColourField({ defaultValue, error }: { defaultValue: string; error?: string }) {
  const [hex, setHex] = useState(defaultValue)
  const tokens = HEX.test(hex) ? normaliseBrand(hex) : null
  return (
    <Field
      id="brandColour"
      label="Brand colour"
      hint="Six-digit hex. Shown normalised for contrast (design §3.5); an achromatic colour becomes steel."
      error={error}
    >
      {(p) => (
        <div className={c.swatchRow}>
          <input
            {...p}
            name="brandColour"
            value={hex}
            onChange={(e) => setHex(e.target.value)}
            className={`${c.input} num ${c.fieldShort}`}
            maxLength={7}
            spellCheck={false}
            autoComplete="off"
          />
          {tokens ? (
            <>
              <span className={c.swatch} style={{ background: tokens.fill }} title={`fill ${tokens.fill}`} />
              <span className={c.swatch} style={{ background: tokens.ink }} title={`ink ${tokens.ink}`} />
              <span className={c.swatch} style={{ background: tokens.wash }} title={`wash ${tokens.wash}`} />
              <span className={`${c.muted} num`}>fill {tokens.fill} · ink {tokens.ink}</span>
            </>
          ) : (
            <span className={c.muted}>Enter a hex like #1F6F5C</span>
          )}
        </div>
      )}
    </Field>
  )
}
