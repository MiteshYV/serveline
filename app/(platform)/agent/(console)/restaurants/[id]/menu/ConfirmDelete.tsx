'use client'

import { AlertDialog } from '@astryxdesign/core/AlertDialog'
import { useRef, useState } from 'react'
import { Button } from '@/ui/Button.tsx'

type Props = {
  /** The server action the confirm submits to, with `fields` as its FormData. */
  action: (fd: FormData) => void | Promise<void>
  fields: Record<string, string>
  /** The button on the page. */
  trigger: string
  /** Names the thing being deleted — "Delete “Starters”?" — never "Are you sure?". */
  title: string
  /** What goes with it, and that it cannot be undone. Plain text: Astryx links it as the
   *  dialog's aria-describedby, so a screen reader reads it on open. */
  description: string
  /** The confirm button's words: the verb and its object, so the dialog can be read from it alone. */
  confirm: string
}

/**
 * Design §11.20: the only permitted modal is a destructive confirm. Deleting a menu category took
 * one tap and took every item under it with no way back, which is exactly the case §6.3 means by
 * "isolate destruction".
 *
 * Astryx's AlertDialog (ADR 0010) owns the focus trap, Escape and returning focus to the trigger.
 * The <form> stays on the page and the dialog is portalled, so the confirm cannot submit by
 * bubbling to it; `onAction` calls `requestSubmit()` and then closes — AlertDialog deliberately
 * does not close itself, so the order is ours.
 *
 * `actionVariant` defaults to `destructive` because this one genuinely destroys data.
 */
export function ConfirmDelete({ action, fields, trigger, title, description, confirm }: Props) {
  const form = useRef<HTMLFormElement>(null)
  const [open, setOpen] = useState(false)
  return (
    <form action={action} ref={form}>
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <Button size="dense" variant="ghost" onClick={() => setOpen(true)}>{trigger}</Button>
      <AlertDialog
        isOpen={open}
        onOpenChange={setOpen}
        title={title}
        description={description}
        actionLabel={confirm}
        cancelLabel="Keep it"
        onAction={() => {
          form.current?.requestSubmit()
          setOpen(false)
        }}
      />
    </form>
  )
}
