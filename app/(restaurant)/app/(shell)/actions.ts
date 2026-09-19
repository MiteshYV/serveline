'use server'

import { redirect } from 'next/navigation'
import { clearSession } from '@/auth/session.ts'

export async function signOut(): Promise<void> {
  await clearSession('staff')
  redirect('/app/login')
}
