import { mkdirSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite'
import * as schema from './schema/index.ts'

/**
 * One database handle for the process.
 *
 * Locally: PGlite, real Postgres compiled to WASM, persisted to ./data. No Docker, no daemon,
 * no account. Same dialect as production, so the schema and every query are identical there.
 *
 * Production (`DATABASE_URL=postgres://...`): swap the driver in `open()` below. Nothing else in
 * the codebase imports a driver — this file is the only place that knows which one is in use.
 */

const DEFAULT_URL = 'file://./data/serveline.pglite'

function open() {
  const url = process.env.DATABASE_URL ?? DEFAULT_URL

  if (url.startsWith('file://')) {
    const dir = url.slice('file://'.length)
    mkdirSync(dir, { recursive: true }) // PGlite's own mkdir is not recursive
    return drizzlePglite(new PGlite(dir), { schema })
  }

  // ponytail: postgres:// is not wired until there is a staging database to wire it to.
  // When it is: `import postgres from 'postgres'` + `drizzle-orm/postgres-js`, ~4 lines.
  throw new Error(`DATABASE_URL scheme not supported yet: ${url.split(':')[0]}`)
}

// Next.js dev reloads modules; keep one instance across reloads or PGlite opens the same
// directory twice and locks.
const g = globalThis as unknown as { __serveline_db?: ReturnType<typeof open> }
export const db = (g.__serveline_db ??= open())

export type Db = typeof db
export { schema }
