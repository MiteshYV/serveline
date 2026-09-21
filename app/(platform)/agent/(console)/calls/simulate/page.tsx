import { requirePlatform } from '@/auth/session.ts'
import { getRestaurant, listCallers, listRestaurants } from '@/db/repos/index.ts'
import { PageHead } from '../../../bits.tsx'
import { Simulator } from './Simulator.tsx'

export const metadata = { title: 'Call simulator — ServeLine agent console' }

/**
 * M2 design "Surfaces", the simulator: outlets and seeded customers as choices, then a text
 * conversation with the brain. The choices are loaded here; the conversation is Simulator.tsx
 * over the server actions in actions.ts. Acceptance 1, 2 and 4 are run from this page.
 */
export default async function SimulatePage() {
  await requirePlatform()
  // ponytail: one read per restaurant for its outlets — a pilot has three. The upgrade is a
  // `listOutlets()` in repos/restaurants.ts when the picker outgrows one <select>.
  const restaurants = (await Promise.all((await listRestaurants()).map((r) => getRestaurant(r.id)))).filter((r) => r !== null)
  const outlets = restaurants.flatMap((r) => r.outlets.map((o) => ({ id: o.id, restaurant: r.name, name: o.name })))
  // The hash stays on the server: the action looks the caller up by id and hands the loop the hash.
  const callers = (await listCallers()).map(({ id, firstName, phoneTail, preferredLanguage }) => ({ id, firstName, phoneTail, preferredLanguage }))

  return (
    <>
      <PageHead
        title="Call simulator"
        meta="A real call row with transport = browser, driven by text. What the model does with each message shows under its reply."
      />
      <Simulator outlets={outlets} callers={callers} />
    </>
  )
}
