import type { Config } from 'drizzle-kit'

export default {
  schema: './src/db/schema',
  out: './src/db/migrations',
  dialect: 'postgresql',
  // PGlite locally, a real Postgres connection string in staging and production.
  // Same dialect either way — that is the reason for choosing PGlite over SQLite.
  dbCredentials: { url: process.env.DATABASE_URL ?? 'file://./data/serveline.pglite' },
} satisfies Config
