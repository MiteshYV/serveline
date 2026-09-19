import { notFound } from 'next/navigation'
import { requirePlatform } from '@/auth/session.ts'
import { PageHead } from '../../../../../../bits.tsx'
import { loadEditor } from '../../load.ts'
import { ItemForm } from '../ItemForm.tsx'

type Params = Promise<{ id: string; itemId: string }>
type Search = Promise<Record<string, string | string[] | undefined>>

export default async function EditItemPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  await requirePlatform()
  const { id, itemId } = await params
  const sp = await searchParams
  const { restaurant, outlet, tree, menuHref } = await loadEditor(id, sp.outlet)
  const item = tree?.items.find((i) => i.id === itemId)
  if (!outlet || !tree || !item) notFound()

  return (
    <>
      <PageHead
        crumbs={<><a href="/agent">Restaurants</a> / <a href={`/agent/restaurants/${id}`}>{restaurant.name}</a> / <a href={menuHref}>Menu</a> / {item.name}</>}
        title={item.name}
        meta={`${restaurant.name} · ${outlet.name}`}
      />
      <ItemForm
        restaurantId={id}
        outletId={outlet.id}
        categories={tree.categories.map((cat) => ({ id: cat.id, name: cat.name }))}
        item={item}
        defaultCategoryId={item.categoryId}
        backHref={menuHref}
      />
    </>
  )
}
