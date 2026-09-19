import { requirePlatform } from '@/auth/session.ts'
import { AUDIT_PAGE_SIZE, listAuditEntities, listAuditLog } from '@/db/repos/index.ts'
import { Button } from '@/ui/Button.tsx'
import { Field } from '@/ui/Field.tsx'
import { PageHead, Panel, Tag } from '../../bits.tsx'
import c from '../../console.module.css'
import { fmtIst, shortId } from '../../format.ts'

export const metadata = { title: 'Audit log — ServeLine agent console' }

type Search = Promise<Record<string, string | string[] | undefined>>
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? ''

/** Build Spec §8 "Admin only: ... view the audit log". Newest first, 100 a page, filter by entity. */
export default async function AuditPage({ searchParams }: { searchParams: Search }) {
  const session = await requirePlatform()
  if (session.role !== 'admin') {
    return (
      <>
        <PageHead title="Audit log" />
        <Panel title="Admin only">
          <p className="m-0">Build Spec §8 reserves the audit log for admins. Your session is an agent session.</p>
        </Panel>
      </>
    )
  }

  const sp = await searchParams
  const entity = one(sp.entity)
  const pageNo = Math.max(1, Number.parseInt(one(sp.page), 10) || 1)
  const entities = await listAuditEntities()
  const { rows, hasMore, page } = await listAuditLog({ entity: entity || undefined, page: pageNo })
  const href = (p: number) => `/agent/audit?${new URLSearchParams({ ...(entity ? { entity } : {}), page: String(p) })}`

  return (
    <>
      <PageHead
        title="Audit log"
        meta={<>Every customer-data write, from the repository layer. Page <span className="num">{page}</span>, <span className="num">{AUDIT_PAGE_SIZE}</span> per page.</>}
      />

      <form method="get" action="/agent/audit" className={c.inlineForm}>
        <Field id="entity" label="Entity" className="w-[220px]">
          {(p) => (
            <select {...p} name="entity" defaultValue={entity} className={c.select}>
              <option value="">All entities</option>
              {entities.map((e) => <option key={e} value={e}>{e}</option>)}
            </select>
          )}
        </Field>
        <Button type="submit" size="dense" variant="ghost">Apply</Button>
        {entity && <Button href="/agent/audit" size="dense" variant="ghost">Clear</Button>}
      </form>

      <div className={c.tableWrap}>
        <table className={c.table}>
          <thead>
            <tr><th>At</th><th>Actor</th><th>Action</th><th>Entity</th><th>Entity id</th><th>Change</th></tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id}>
                <td className={`${c.nowrap} num`}>{fmtIst(a.at)}</td>
                <td><Tag>{a.actorType}</Tag> {a.actorId && <span className={`${c.muted} num`}>{shortId(a.actorId)}</span>}</td>
                <td className="num">{a.action}</td>
                <td>{a.entity}</td>
                <td className="num">{shortId(a.entityId)}</td>
                <td>
                  <details className={c.details}>
                    <summary>{a.before === null ? 'created' : a.after === null ? 'deleted' : 'before / after'}</summary>
                    <pre className={c.pre}>{JSON.stringify({ before: a.before, after: a.after }, null, 2)}</pre>
                  </details>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={6} className={c.muted}>{entity ? `No audit rows for ${entity} on this page.` : 'No audit rows yet.'}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className={c.actions}>
        {page > 1 && <Button href={href(page - 1)} size="dense" variant="ghost">Newer</Button>}
        {hasMore && <Button href={href(page + 1)} size="dense" variant="ghost">Older</Button>}
      </div>
    </>
  )
}
