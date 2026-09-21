'use server'

import type { Route } from 'next'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { requirePlatform } from '@/auth/session.ts'
import { CALL_TAGS, tagCall } from '@/db/repos/index.ts'

const form = z.object({ id: z.uuid(), tag: z.enum(CALL_TAGS) })

/**
 * The review screen's one write (M2 design "Surfaces"; Build Spec §8 "tag the failure"): the
 * tag, through the repo, which audits it. The actor is the session, never the form. An empty
 * choice goes back as `?error=`, as the restaurant admin forms do.
 */
export async function saveTag(fd: FormData): Promise<void> {
  const session = await requirePlatform()
  const id = z.uuid().safeParse(fd.get('id'))
  if (!id.success) redirect('/agent/calls' as Route)
  const path = `/agent/calls/${id.data}`
  const parsed = form.safeParse({ id: id.data, tag: fd.get('tag') })
  if (!parsed.success) redirect(`${path}?error=${encodeURIComponent('Choose a tag before saving.')}` as Route)
  await tagCall(parsed.data.id, parsed.data.tag, { type: 'platform', id: session.subjectId })
  revalidatePath(path)
  redirect(path as Route)
}
