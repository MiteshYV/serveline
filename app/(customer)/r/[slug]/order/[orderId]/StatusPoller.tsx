'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

const EVERY_MS = 10_000

/**
 * Build Spec §6: "an order status page that polls every 10 seconds". Asks the status route and,
 * when the answer differs from what is on screen, refreshes the server-rendered page — the
 * client renders nothing itself, so the status vocabulary stays in one place.
 */
export function StatusPoller({ orderId, status, paymentStatus }: { orderId: string; status: string; paymentStatus: string }) {
  const router = useRouter()
  useEffect(() => {
    let stopped = false
    const tick = async () => {
      try {
        const res = await fetch(`/api/v1/orders/${orderId}/status`, { cache: 'no-store' })
        if (!res.ok) return
        const next = (await res.json()) as { status?: string; paymentStatus?: string }
        if (!stopped && (next.status !== status || next.paymentStatus !== paymentStatus)) router.refresh()
      } catch {
        /* offline: the next tick tries again */
      }
    }
    const id = setInterval(tick, EVERY_MS)
    return () => {
      stopped = true
      clearInterval(id)
    }
  }, [orderId, status, paymentStatus, router])
  return null
}
