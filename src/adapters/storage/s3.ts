import type { StorageAdapter } from './index.ts'

// .env.example's storage block. Credentials come from the SDK's default chain, not from here.
const REQUIRED_ENV = ['AWS_REGION', 'S3_BUCKET_ASSETS'] as const

/**
 * Stub. No bucket exists (M1 design §"Build mode"), so `VENDOR_MODE=live` fails loudly here rather
 * than quietly falling back to local disk (CLAUDE.md).
 *
 * ponytail: when the bucket exists this is PutObject with ContentType and a presigned GetObject
 * (`@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`), region ap-south-1 for DPDP residency
 * (Build Spec §10).
 */
export function s3Storage(): StorageAdapter {
  const missing = REQUIRED_ENV.filter((name) => !process.env[name])
  if (missing.length > 0) throw new Error(`not configured: ${missing.join(', ')}`)
  throw new Error('not implemented: the S3 client is a stub until a bucket exists')
}
