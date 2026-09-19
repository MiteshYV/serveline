/**
 * Sliding-window counter: at most `max` hits per key in any `windowMs` span.
 *
 * ponytail: in-process map; Redis when the app has more than one process (M2 brings Redis anyway).
 * Until then a second instance would have its own counters, and a restart forgets them.
 */
export function createLimiter(max: number, windowMs: number) {
  const hits = new Map<string, number[]>()
  return {
    /** Records a hit and returns false if this one exceeds the limit. Refused hits are not counted. */
    hit(key: string, now = Date.now()): boolean {
      const floor = now - windowMs
      const recent = (hits.get(key) ?? []).filter((t) => t > floor)
      const allowed = recent.length < max
      if (allowed) recent.push(now)
      hits.set(key, recent)
      // Keys that have gone quiet are dropped only when the map has grown enough to matter.
      if (hits.size > 10_000) for (const [k, ts] of hits) if ((ts.at(-1) ?? 0) <= floor) hits.delete(k)
      return allowed
    },
  }
}
