import { notFound } from 'next/navigation'
import { getPublishedMenu } from '@/db/repos/index.ts'
import { currentOutlet } from '../../../_lib/session.ts'
import { ItemForm, type ItemFormData } from './ItemForm.tsx'
import styles from '../Menu.module.css'

export const metadata = { title: 'Menu item — ServeLine' }

const rupees = (p: number) => (p % 100 === 0 ? String(p / 100) : (p / 100).toFixed(2))

/** `/app/menu/new?category=…` creates; `/app/menu/{itemId}` edits. */
export default async function ItemPage({ params, searchParams }: { params: Promise<{ itemId: string }>; searchParams: Promise<{ category?: string }> }) {
  const { itemId } = await params
  const { category } = await searchParams
  const { outlet } = await currentOutlet()
  const menu = await getPublishedMenu(outlet.id)
  if (!menu) notFound()
  const categories = menu.categories.map((c) => ({ id: c.id, name: c.name }))

  let item: ItemFormData
  if (itemId === 'new') {
    const first = categories.find((c) => c.id === category) ?? categories[0]
    if (!first) notFound()
    item = { categoryId: first.id, name: '', description: '', price: '', isVeg: true, spiceLevel: 'none', isAvailable: true, variants: [], optionGroups: [] }
  } else {
    const row = menu.items.find((i) => i.id === itemId)
    if (!row) notFound()
    item = {
      id: row.id,
      categoryId: row.categoryId,
      name: row.name,
      description: row.description ?? '',
      price: rupees(row.pricePaise),
      isVeg: row.isVeg,
      spiceLevel: row.spiceLevel,
      isAvailable: row.isAvailable,
      variants: row.variants.map((v) => ({ id: v.id, name: v.name, delta: rupees(v.priceDeltaPaise) })),
      optionGroups: row.optionGroups.map((g) => ({
        id: g.id, name: g.name, min: g.minSelect, max: g.maxSelect,
        options: g.options.map((o) => ({ id: o.id, name: o.name, delta: rupees(o.priceDeltaPaise) })),
      })),
    }
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>{itemId === 'new' ? 'Add item' : item.name}</h1>
      <ItemForm item={item} categories={categories} />
    </div>
  )
}
