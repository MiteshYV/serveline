import { requirePlatform } from '@/auth/session.ts'
import { Button } from '@/ui/Button.tsx'
import { Field } from '@/ui/Field.tsx'
import { FssaiMark } from '@/ui/FssaiMark.tsx'
import { ErrorBand, PageHead, Panel, Tag } from '../../../../bits.tsx'
import c from '../../../../console.module.css'
import { fmtIst, inr } from '../../../../format.ts'
import { createMenu, publish, removeCategory, removeItem, saveCategory, setAvailability } from './actions.ts'
import { loadEditor } from './load.ts'

type Params = Promise<{ id: string }>
type Search = Promise<Record<string, string | string[] | undefined>>

/**
 * Build Spec §7 "Menu: ... item add and edit with variants and options. Publishing bumps
 * `menu.version`", done here by the agent on the restaurant's behalf (§8). A plain dense form
 * UI. The photo-to-menu extraction and vocabulary generation are M4 (Build Spec §14) and are
 * deliberately not built: the button is there, disabled, so the agent knows where it will be.
 */
export default async function MenuEditorPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  await requirePlatform()
  const { id } = await params
  const sp = await searchParams
  const { restaurant, outlet, tree, menuHref } = await loadEditor(id, sp.outlet)
  const error = Array.isArray(sp.error) ? sp.error[0] : sp.error

  const crumbs = <><a href="/agent">Restaurants</a> / <a href={`/agent/restaurants/${id}`}>{restaurant.name}</a> / Menu</>

  if (!outlet) {
    return (
      <>
        <PageHead crumbs={crumbs} title="Menu" />
        <Panel title="No outlet">
          <p className="m-0">A menu belongs to an outlet, and this restaurant has none yet.</p>
        </Panel>
      </>
    )
  }

  const ctx = (
    <>
      <input type="hidden" name="restaurantId" value={id} />
      <input type="hidden" name="outletId" value={outlet.id} />
    </>
  )

  const digitise = (
    // Tooltip on the wrapper: a disabled button does not raise mouse events in every browser.
    <span title="Arrives with M4">
      <Button size="dense" variant="ghost" disabled aria-describedby="digitise-note">Digitise from photos</Button>
      <span id="digitise-note" className="sr-only">Arrives with M4</span>
    </span>
  )

  return (
    <>
      {error && <ErrorBand message={error} dismissHref={menuHref} />}
      <PageHead
        crumbs={crumbs}
        title={`Menu — ${outlet.name}`}
        meta={
          tree ? (
            <>
              <span className="num">v{tree.menu.version}</span> ·{' '}
              {tree.menu.publishedAt ? <>published <span className="num">{fmtIst(tree.menu.publishedAt)}</span></> : 'draft, never published'} ·{' '}
              <span className="num">{tree.items.length}</span> items in <span className="num">{tree.categories.length}</span> categories.
              Edits are live at once; publishing bumps the version.
            </>
          ) : 'No menu row yet.'
        }
        actions={
          <>
            {restaurant.outlets.length > 1 && (
              <span className={c.actions}>
                {restaurant.outlets.map((o) => (
                  <Button key={o.id} href={`/agent/restaurants/${id}/menu?outlet=${o.id}`} size="dense" variant="ghost" aria-current={o.id === outlet.id ? 'page' : undefined}>
                    {o.name}
                  </Button>
                ))}
              </span>
            )}
            {digitise}
            {tree && (
              <form action={publish}>
                {ctx}
                <Button type="submit" size="dense">Publish</Button>
              </form>
            )}
          </>
        }
      />

      {!tree ? (
        <Panel title="Create the menu">
          <p className="m-0">Creates an empty draft for {outlet.name}. It stays off the ordering page until published.</p>
          <form action={createMenu}>
            {ctx}
            <Button type="submit" size="dense">Create menu</Button>
          </form>
        </Panel>
      ) : (
        <>
          {tree.categories.map((cat) => (
            <Panel
              key={cat.id}
              title={
                <form action={saveCategory} className={c.inlineForm}>
                  {ctx}
                  <input type="hidden" name="id" value={cat.id} />
                  <input type="hidden" name="menuId" value={tree.menu.id} />
                  <input aria-label="Category name" name="name" defaultValue={cat.name} className={`${c.input} w-[280px]`} required />
                  <input aria-label="Sort order" name="sort" defaultValue={cat.sort} className={`${c.input} num w-[72px]`} inputMode="numeric" />
                  <Button type="submit" size="dense" variant="ghost">Save</Button>
                </form>
              }
              actions={
                <>
                  <Button href={`/agent/restaurants/${id}/menu/items/new?category=${cat.id}&outlet=${outlet.id}`} size="dense">Add item</Button>
                  <form action={removeCategory}>
                    {ctx}
                    <input type="hidden" name="id" value={cat.id} />
                    <Button type="submit" size="dense" variant="ghost">Delete category</Button>
                  </form>
                </>
              }
            >
              <div className={c.tableWrap}>
                <table className={c.table}>
                  <thead>
                    <tr><th>Item</th><th className={c.right}>Price</th><th>Variants</th><th>Options</th><th>Spice</th><th>Availability</th><th></th></tr>
                  </thead>
                  <tbody>
                    {cat.items.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <span className="inline-flex items-center gap-[var(--space-8)]">
                            <FssaiMark veg={item.isVeg} />
                            <a href={`/agent/restaurants/${id}/menu/items/${item.id}?outlet=${outlet.id}`}>{item.name}</a>
                          </span>
                          {item.description && <span className={`${c.muted} block`}>{item.description}</span>}
                        </td>
                        <td className={`${c.right} num`}>{inr(item.pricePaise)}</td>
                        <td>{item.variants.map((v) => `${v.name} ${v.priceDeltaPaise === 0 ? '' : `(${v.priceDeltaPaise > 0 ? '+' : ''}${inr(v.priceDeltaPaise)})`}`).join(', ') || <span className={c.muted}>—</span>}</td>
                        <td>{item.optionGroups.map((g) => `${g.name} (${g.minSelect}–${g.maxSelect} of ${g.options.length})`).join(', ') || <span className={c.muted}>—</span>}</td>
                        <td>{item.spiceLevel === 'none' ? <span className={c.muted}>—</span> : item.spiceLevel}</td>
                        <td>
                          <form action={setAvailability} className="inline-flex items-center gap-[var(--space-8)]">
                            {ctx}
                            <input type="hidden" name="itemId" value={item.id} />
                            <input type="hidden" name="isAvailable" value={item.isAvailable ? 'false' : 'true'} />
                            {item.isAvailable ? <Tag tone="strong">Available</Tag> : <Tag tone="quiet">Sold out</Tag>}
                            <Button type="submit" size="dense" variant="ghost">{item.isAvailable ? 'Mark sold out' : 'Mark available'}</Button>
                          </form>
                        </td>
                        <td className={c.right}>
                          <form action={removeItem}>
                            {ctx}
                            <input type="hidden" name="itemId" value={item.id} />
                            <Button type="submit" size="dense" variant="ghost">Delete</Button>
                          </form>
                        </td>
                      </tr>
                    ))}
                    {cat.items.length === 0 && <tr><td colSpan={7} className={c.muted}>No items in this category yet.</td></tr>}
                  </tbody>
                </table>
              </div>
            </Panel>
          ))}

          <Panel title="Add category">
            <form action={saveCategory} className={c.inlineForm}>
              {ctx}
              <input type="hidden" name="menuId" value={tree.menu.id} />
              <Field id="new-category" label="Name" className="w-[280px]">
                {(p) => <input {...p} name="name" className={c.input} required />}
              </Field>
              <Field id="new-category-sort" label="Sort" className="w-[72px]">
                {(p) => <input {...p} name="sort" className={`${c.input} num`} inputMode="numeric" defaultValue={tree.categories.length} />}
              </Field>
              <Button type="submit" size="dense" variant="ghost">Add category</Button>
            </form>
          </Panel>
        </>
      )}
    </>
  )
}
