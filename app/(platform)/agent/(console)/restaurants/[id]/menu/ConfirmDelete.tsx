'use client'

import { useRef, type ReactNode } from 'react'
import { Button } from '@/ui/Button.tsx'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/ui/primitives/alert-dialog.tsx'

type Props = {
  /** The server action the confirm submits to, with `fields` as its FormData. */
  action: (fd: FormData) => void | Promise<void>
  fields: Record<string, string>
  /** The button on the page. */
  trigger: string
  /** Names the thing being deleted — "Delete “Starters”?" — never "Are you sure?". */
  title: string
  /** What goes with it, and that it cannot be undone. */
  description: ReactNode
  /** The confirm button's words: the verb and its object, so the dialog can be read from it alone. */
  confirm: string
}

/**
 * Design §11.20: the only permitted modal is a destructive confirm. Deleting a menu category took
 * one tap and took every item under it with no way back, which is exactly the case §6.3 means by
 * "isolate destruction".
 *
 * The <form> stays on the page and the dialog is portalled to <body>, so the confirm cannot
 * submit by bubbling to it. It calls `requestSubmit()` instead, which fires the submit event
 * synchronously — before Radix's own handler closes the dialog and unmounts the button. A
 * `type="submit"` here would be a race with that unmount.
 *
 * `variant="danger"` because this one genuinely destroys data; a confirm that merely asks
 * "publish?" keeps the steel plate the primitive defaults to, so red still means red.
 */
export function ConfirmDelete({ action, fields, trigger, title, description, confirm }: Props) {
  const form = useRef<HTMLFormElement>(null)
  return (
    <form action={action} ref={form}>
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button size="dense" variant="ghost">{trigger}</Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription>{description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel size="dense">Keep it</AlertDialogCancel>
            <AlertDialogAction size="dense" variant="danger" onClick={() => form.current?.requestSubmit()}>
              {confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  )
}
