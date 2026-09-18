import { timestamp, uuid } from 'drizzle-orm/pg-core'

/** Build Spec §4: timestamps in UTC. The app renders Asia/Kolkata; the database never does. */
export const utc = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' })

export const id = () => uuid('id').primaryKey().defaultRandom()

export const createdAt = () => utc('created_at').notNull().defaultNow()

/**
 * A foreign key column. Chain `.references(() => target.id, { onDelete: ... })` at the call
 * site — the reference is deliberately not hidden in here, because which rows cascade and
 * which are restricted is a decision per relationship, not a default.
 */
export const fk = (name: string) => uuid(name).notNull()
export const nullableFk = (name: string) => uuid(name)
