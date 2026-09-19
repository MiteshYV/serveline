import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile, rm } from 'node:fs/promises'
import { test } from 'node:test'
import { storage } from './index.ts'
import { mockStorageAdapter as adapter, UPLOADS_ROOT, uploadPath } from './mock.ts'

const dir = `test-${randomUUID()}`

test('put writes under ./uploads and the bytes read back from disk', async (t) => {
  t.after(() => rm(`${UPLOADS_ROOT}/${dir}`, { recursive: true, force: true }))

  const key = `${dir}/menus/outlet-1/page-1.txt`
  const bytes = new TextEncoder().encode('Masala Dosa — Rs 80')
  assert.deepEqual(await adapter.put(key, bytes, 'text/plain'), { key })

  const back = await readFile(uploadPath(key))
  assert.equal(back.toString('utf8'), 'Masala Dosa — Rs 80')
  assert.ok(uploadPath(key).startsWith(UPLOADS_ROOT))
})

test('signedUrl returns the /uploads path with an expiry ttlSeconds ahead', async () => {
  const before = Math.floor(Date.now() / 1000)
  const url = await adapter.signedUrl('cards/batch-1.pdf', 900)
  const match = url.match(/^\/uploads\/cards\/batch-1\.pdf\?exp=(\d+)$/)
  assert.ok(match, url)
  const exp = Number(match?.[1])
  assert.ok(exp >= before + 900 && exp <= before + 901)
})

test('a key that escapes the uploads directory is refused', async () => {
  for (const bad of ['../etc/passwd', '/etc/passwd', 'a/../../b', 'a//b', '', 'a b', 'a\\b']) {
    assert.throws(() => uploadPath(bad), /Invalid storage key/, bad)
    await assert.rejects(adapter.put(bad, new Uint8Array(), 'text/plain'), /Invalid storage key/)
    await assert.rejects(adapter.signedUrl(bad, 60), /Invalid storage key/)
  }
})

test('VENDOR_MODE=live fails loudly instead of falling back to local disk', () => {
  const saved = process.env.VENDOR_MODE
  try {
    process.env.VENDOR_MODE = 'live'
    assert.throws(() => storage(), /not configured: AWS_REGION/)
    process.env.VENDOR_MODE = 'mock'
    assert.equal(storage(), adapter)
  } finally {
    if (saved === undefined) delete process.env.VENDOR_MODE
    else process.env.VENDOR_MODE = saved
  }
})
