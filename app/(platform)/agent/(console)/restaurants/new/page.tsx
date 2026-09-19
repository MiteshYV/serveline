import { requirePlatform } from '@/auth/session.ts'
import { PageHead } from '../../../bits.tsx'
import { NewRestaurantForm } from './NewRestaurantForm.tsx'

export const metadata = { title: 'Add restaurant — ServeLine agent console' }

/** Build Spec §11 step 1: restaurant, outlet and owner in one server action. */
export default async function NewRestaurantPage() {
  await requirePlatform()
  return (
    <>
      <PageHead
        crumbs={<><a href="/agent">Restaurants</a> / New</>}
        title="Add restaurant"
        meta="Creates the restaurant, its first outlet and the owner's dashboard login together."
      />
      <NewRestaurantForm />
    </>
  )
}
