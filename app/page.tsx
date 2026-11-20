import { redirect } from 'next/navigation'

/**
 * There is no landing page. The restaurant dashboard is the primary experience (ADR 0010), so the
 * bare origin goes there; it redirects on to /app/login when there is no session.
 */
export default function Root() {
  redirect('/app')
}
