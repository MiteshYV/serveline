import { getPublishedMenu, toPricedMenu } from '@/db/repos/index.ts'
import { Button } from '@/ui/Button.tsx'
import { td } from '@/ui/i18n-dashboard.ts'
import { t } from '@/ui/i18n.ts'
import { readLang } from '../../../_lib/prefs.ts'
import { currentOutlet } from '../../../_lib/session.ts'
import { ManualOrder, type Category } from './ManualOrder.tsx'

export const metadata = { title: 'New order — ServeLine' }

export default async function NewOrderPage() {
  const { outlet } = await currentOutlet()
  const lang = await readLang()
  const menu = await getPublishedMenu(outlet.id)
  if (!menu) {
    return (
      <div className="grid gap-[var(--space-16)]">
        <p className="m-0">{t('menu.closed', lang)}</p>
        <Button size="counter" href="/app/menu">{td('nav.menu', lang)}</Button>
      </div>
    )
  }
  const categories: Category[] = menu.categories
    .filter((c) => c.items.length > 0)
    .map((c) => ({
      id: c.id,
      name: c.name,
      items: c.items.map((i) => ({ id: i.id, name: i.name, description: i.description, pricePaise: i.pricePaise, isVeg: i.isVeg, isAvailable: i.isAvailable })),
    }))
  return <ManualOrder lang={lang} categories={categories} priced={toPricedMenu(menu)} codEnabled={outlet.codEnabled} />
}
