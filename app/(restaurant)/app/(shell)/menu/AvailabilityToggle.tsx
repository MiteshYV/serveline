'use client'

import { useState, useTransition } from 'react'
import { Switch } from '@/ui/primitives/switch.tsx'
import { setAvailability } from './actions.ts'

type Props = {
  itemId: string
  /** The dish's own name is the switch's accessible name: one row, one subject. */
  itemName: string
  available: boolean
}

/**
 * "Sold out today" (Build Spec §7) — the one availability control in the product.
 *
 * It used to be built twice: an immediate submit button on this list, and a deferred checkbox
 * inside the item editor that only took effect on Save. Two controls for one fact meant the
 * editor could quietly undo a sold-out flag set at the counter thirty seconds earlier. This is
 * the immediate one, because that is what the Spec asks for — "live at once; no publish needed"
 * — and because a cook marking paneer finished mid-rush cannot be asked to find a Save button.
 *
 * Not `disabled` while the write is in flight. The write is a few hundred milliseconds and the
 * position is already showing the new state, so dimming the control to an inert pair for that
 * long tells the operator something is wrong when nothing is. A second tap is swallowed instead.
 */
export function AvailabilityToggle({ itemId, itemName, available }: Props) {
  const [on, setOn] = useState(available)
  const [server, setServer] = useState(available)
  const [pending, start] = useTransition()

  // The server is the truth: when the revalidated page brings a new value, adopt it. Adjusting
  // state during render rather than in an effect, so there is no flash of the stale position.
  if (server !== available) {
    setServer(available)
    setOn(available)
  }

  const toggle = (next: boolean) => {
    if (pending) return
    setOn(next)
    const form = new FormData()
    form.set('itemId', itemId)
    form.set('available', next ? '1' : '0')
    start(async () => {
      await setAvailability(form)
    })
  }

  // The switch's name is the dish: one row, one subject. The state's *word* is the row's
  // "Not available today" (design §3.3) — the position and the word carry it, never the colour.
  return <Switch checked={on} onCheckedChange={toggle} aria-label={itemName} />
}
