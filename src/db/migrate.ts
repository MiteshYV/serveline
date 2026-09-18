import { migrate } from 'drizzle-orm/pglite/migrator'
import { db } from './client.ts'

// `npm run db:migrate`. Applies whatever `drizzle-kit generate` has written to ./migrations.
await migrate(db, { migrationsFolder: './src/db/migrations' })
console.log('migrations applied')
process.exit(0)
