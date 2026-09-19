import Link from 'next/link'
import { formatISTDateTime } from '@/core/calendar.ts'
import { formatINR, paise } from '@/core/money.ts'
import { getPublishedMenu } from '@/db/repos/index.ts'
import { Button } from '@/ui/Button.tsx'
import { FssaiMark } from '@/ui/FssaiMark.tsx'
import { td } from '@/ui/i18n-dashboard.ts'
import { t } from '@/ui/i18n.ts'
import { readLang } from '../../_lib/prefs.ts'
import { currentOutlet } from '../../_lib/session.ts'
import { publish, setAvailability } from './actions.ts'
import styles from './Menu.module.css'

export const metadata = { title: 'Menu — ServeLine' }

/** Build Spec §7 "Menu": availability per item, price edits, add/edit with variants and options, publish. */
export default async function MenuPage() {
  const { outlet } = await currentOutlet()
  const lang = await readLang()
  const menu = await getPublishedMenu(outlet.id)
  if (!menu) {
    return <p className="m-0">No menu has been published for this outlet yet. The agent console publishes the first one (Build Spec §8).</p>
  }

  return (
    <div className={styles.page}>
      <div className={styles.head}>
        <div>
          <h1 className={styles.title}>{td('nav.menu', lang)}</h1>
          <p className={styles.meta}>
            {td('menu.version', lang, { v: menu.menu.version })}
            {menu.menu.publishedAt && <> · <span className="num">{formatISTDateTime(menu.menu.publishedAt)}</span></>}
          </p>
        </div>
        <form action={publish}>
          <Button size="counter" type="submit">{td('menu.publish', lang)}</Button>
        </form>
      </div>

      {menu.categories.map((c) => (
        <section key={c.id} className={styles.category}>
          <div className={styles.categoryHead}>
            <h2 className={styles.categoryName}>{c.name}</h2>
            <Button size="dense" variant="ghost" href={`/app/menu/new?category=${c.id}`}>{td('menu.addItem', lang)}</Button>
          </div>
          <ul className={styles.list}>
            {c.items.map((item) => (
              <li key={item.id} className={styles.item} data-unavailable={item.isAvailable ? undefined : true}>
                <FssaiMark veg={item.isVeg} lang={lang} />
                <div className={styles.body}>
                  <span className={styles.name}>{item.name}</span>
                  <span className={`${styles.price} num`}>{formatINR(paise(item.pricePaise))}</span>
                  {!item.isAvailable && <span className={styles.soldOut}>{t('menu.unavailable', lang)}</span>}
                </div>
                <div className={styles.controls}>
                  <form action={setAvailability}>
                    <input type="hidden" name="itemId" value={item.id} />
                    <input type="hidden" name="available" value={item.isAvailable ? '0' : '1'} />
                    <Button size="counter" variant={item.isAvailable ? 'ghost' : 'primary'} type="submit">
                      {td(item.isAvailable ? 'menu.markSoldOut' : 'menu.markAvailable', lang)}
                    </Button>
                  </form>
                  <Link href={`/app/menu/${item.id}`} className="inline-flex items-center min-h-[var(--touch-counter)] px-[var(--space-12)]" style={{ fontWeight: 'var(--fw-bold)', color: 'var(--text-primary)' }}>
                    {td('menu.edit', lang)}
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
