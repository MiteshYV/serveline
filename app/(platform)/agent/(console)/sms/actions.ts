'use server'

import { revalidatePath } from 'next/cache'
import { mockInbox } from '@/adapters/sms/mock.ts'
import { requirePlatform } from '@/auth/session.ts'

export async function clearInbox(): Promise<void> {
  await requirePlatform()
  mockInbox.clear()
  revalidatePath('/agent/sms')
}
