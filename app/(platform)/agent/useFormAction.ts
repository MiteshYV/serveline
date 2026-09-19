'use client'

import { startTransition, useActionState, type FormEvent } from 'react'

/**
 * `useActionState` with a manual submit. Posting through `<form action>` makes React reset the
 * form once the action returns, which wipes every field on a validation error — and design
 * §7.10.3 says the field keeps its value, always. Dispatching from `onSubmit` resets nothing.
 */
export function useFormAction<S>(
  action: (prev: Awaited<S>, fd: FormData) => Promise<Awaited<S>>,
  initial: Awaited<S>,
) {
  const [state, dispatch, pending] = useActionState(action, initial)
  const submit = (fd: FormData) => startTransition(() => dispatch(fd))
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    submit(new FormData(e.currentTarget))
  }
  return { state, pending, onSubmit, submit }
}
