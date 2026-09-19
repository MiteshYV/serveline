import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve, sep } from 'node:path'
import type { StorageAdapter } from './index.ts'

/**
 * The M1 storage mock: local disk under ./uploads (gitignored), per M1 design §"Adapters".
 * Relative to the process's working directory, which is the repository root for `next dev`
 * and `npm test` alike.
 */
export const UPLOADS_ROOT = resolve(process.cwd(), 'uploads')

/** Path segments of safe characters. Rejects `..`, absolute paths, and anything URL-hostile. */
const KEY = /^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/

export function uploadPath(key: string): string {
  const path = resolve(UPLOADS_ROOT, key)
  // The regex already forbids traversal; the prefix check is the belt to its braces.
  if (!KEY.test(key) || key.split('/').includes('..') || !path.startsWith(UPLOADS_ROOT + sep)) {
    throw new Error(`Invalid storage key "${key}"`)
  }
  return path
}

export const mockStorageAdapter: StorageAdapter = {
  // ponytail: `contentType` is not persisted. S3 keeps it as object metadata; on disk the route
  // that serves /uploads infers it from the extension, which every key we write has.
  async put(key, bytes, _contentType) {
    const path = uploadPath(key)
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, bytes)
    return { key }
  },

  // ponytail: `exp` is unsigned. A route serving /uploads at M1 checks the expiry and nothing
  // else; S3's presigned URL carries a real signature. Fine for a laptop, not for a bucket.
  async signedUrl(key, ttlSeconds) {
    uploadPath(key) // validates
    const exp = Math.floor(Date.now() / 1000) + ttlSeconds
    return `/uploads/${key}?exp=${exp}`
  },
}
