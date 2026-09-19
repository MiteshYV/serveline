import { requirePlatform } from '@/auth/session.ts'
import { PageHead, Panel } from '../../../../../../bits.tsx'
import { loadEditor } from '../../load.ts'
import { ItemForm } from '../ItemForm.tsx'

type Params = Promise<{ id: string }>
type Search = Promise<Record<string, string | string[] | undefined>>

export default async function NewItemPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  await requirePlatform()
  const { id } = await params
  const sp = await searchParams
  const { restaurant, outlet, tree, menuHref } = await loadEditor(id, sp.outlet)
  const wanted = Array.isArray(sp.category) ? sp.category[0] : sp.category
  const crumbs = <><a href="/agent">Restaurants</a> / <a href={`/agent/restaurants/${id}`}>{restaurant.name}</a> / <a href={menuHref}>Menu</a> / New item</>

  if (!outlet || !tree || tree.categories.length === 0) {
    return (
      <>
        <PageHead crumbs={crumbs} title="New item" />
        <Panel title="Add a category first">
          <p className="m-0">An item belongs to a category. <a href={menuHref}>Back to the menu</a>.</p>
        </Panel>
      </>
    )
  }

  const categories = tree.categories.map((cat) => ({ id: cat.id, name: cat.name }))
  const defaultCategoryId = categories.find((cat) => cat.id === wanted)?.id ?? categories[0]?.id ?? ''

  return (
    <>
      <PageHead crumbs={crumbs} title="New item" meta={`${restaurant.name} · ${outlet.name}`} />
      <ItemForm restaurantId={id} outletId={outlet.id} categories={categories} item={null} defaultCategoryId={defaultCategoryId} backHref={menuHref} />
    </>
  )
}
