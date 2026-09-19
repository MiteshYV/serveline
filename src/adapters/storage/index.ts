import { vendorMode } from '../mode.ts'
import { mockStorageAdapter } from './mock.ts'
import { s3Storage } from './s3.ts'

/**
 * Object storage: menu photos, card-batch PDFs, and at M2 call recordings (Build Spec §2).
 * Private bucket, signed URLs (Build Spec §10: 15-minute expiry for recordings).
 *
 * Keys are `[A-Za-z0-9._-]` path segments joined by `/`, no leading slash — `menus/{outletId}/1.jpg`.
 */
export type StorageAdapter = {
  put(key: string, bytes: Uint8Array, contentType: string): Promise<{ key: string }>
  signedUrl(key: string, ttlSeconds: number): Promise<string>
}

export function storage(): StorageAdapter {
  return vendorMode() === 'mock' ? mockStorageAdapter : s3Storage()
}
