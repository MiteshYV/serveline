import type { actorType } from '../schema/enums.ts'

/**
 * Who performed a write. Lands on `order_event.actor_*` and `audit_log.actor_*`, both of which
 * hold a nullable id because a webhook or a job has no row to point at — hence `id: null` for
 * `system`, rather than a made-up uuid.
 */
export type ActorType = (typeof actorType.enumValues)[number]
export type Actor = { type: ActorType; id: string | null }

/** The gateway webhook, the retention job: anything that acts without a logged-in person. */
export const SYSTEM: Actor = { type: 'system', id: null }
