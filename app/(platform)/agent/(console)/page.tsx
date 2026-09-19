import { requirePlatform } from '@/auth/session.ts'
import { ONBOARDING_STAGES, STAGE_LABEL, onboardingStage, type OnboardingStage } from '@/core/onboarding.ts'
import { listRestaurantOverviews, overviewFacts } from '@/db/repos/index.ts'
import { Button } from '@/ui/Button.tsx'
import { EmptyState } from '@/ui/EmptyState.tsx'
import { Field } from '@/ui/Field.tsx'
import { t } from '@/ui/i18n.ts'
import { PageHead, Panel, Tag } from '../bits.tsx'
import c from '../console.module.css'
import { capitalise, fmtIst } from '../format.ts'

export const metadata = { title: 'Restaurants — ServeLine agent console' }

const STATUSES = ['trialing', 'active', 'suspended', 'churned'] as const
type Status = (typeof STATUSES)[number]

type Search = Promise<Record<string, string | string[] | undefined>>
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? ''

const isStage = (s: string): s is OnboardingStage => (ONBOARDING_STAGES as readonly string[]).includes(s)
const isStatus = (s: string): s is Status => (STATUSES as readonly string[]).includes(s)

/**
 * Build Spec §8 "Restaurants: list with onboarding stage, pilot metrics, last call, open issues".
 * At M1: stage (derived, see core/onboarding), last order, open needs_attention orders. Pilot
 * metrics are M5 and calls are M2.
 *
 * ponytail: filtering happens in memory over every row. A pilot has three restaurants; the
 * upgrade is a `where` in `listRestaurantOverviews` when the list stops fitting on one screen.
 */
export default async function RestaurantsPage({ searchParams }: { searchParams: Search }) {
  await requirePlatform()
  const sp = await searchParams
  const q = one(sp.q).trim()
  const stageRaw = one(sp.stage)
  const statusRaw = one(sp.status)
  const stage = isStage(stageRaw) ? stageRaw : null
  const status = isStatus(statusRaw) ? statusRaw : null
  const filtered = q !== '' || stage !== null || status !== null

  const all = (await listRestaurantOverviews()).map((r) => ({ ...r, stage: onboardingStage(overviewFacts(r)) }))
  const needle = q.toLowerCase()
  const rows = all.filter((r) =>
    (needle === '' || r.name.toLowerCase().includes(needle) || r.slug.includes(needle))
    && (stage === null || r.stage === stage)
    && (status === null || r.status === status),
  )

  const filterLabel = [stage && STAGE_LABEL[stage], status && capitalise(status)].filter(Boolean).join(', ') || 'all restaurants'

  return (
    <>
      <PageHead
        title="Restaurants"
        meta={<><span className="num">{all.length}</span> on the platform</>}
        actions={<Button href="/agent/restaurants/new" size="dense">Add restaurant</Button>}
      />

      <form method="get" action="/agent" className={c.inlineForm}>
        <Field id="q" label="Search" className="w-[240px]">
          {(p) => <input {...p} name="q" type="search" defaultValue={q} className={c.input} placeholder="Name or slug" />}
        </Field>
        <Field id="stage" label="Stage" className="w-[180px]">
          {(p) => (
            <select {...p} name="stage" defaultValue={stage ?? ''} className={c.select}>
              <option value="">Any</option>
              {ONBOARDING_STAGES.map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
            </select>
          )}
        </Field>
        <Field id="status" label="Status" className="w-[160px]">
          {(p) => (
            <select {...p} name="status" defaultValue={status ?? ''} className={c.select}>
              <option value="">Any</option>
              {STATUSES.map((s) => <option key={s} value={s}>{capitalise(s)}</option>)}
            </select>
          )}
        </Field>
        <Button type="submit" size="dense" variant="ghost">Apply</Button>
        {filtered && <Button href="/agent" size="dense" variant="ghost">{t('empty.clearFilters', 'en')}</Button>}
      </form>

      {rows.length === 0 ? (
        all.length === 0 ? (
          <Panel title="No restaurants yet">
            <p className="m-0">Add the first one to start its onboarding checklist.</p>
            <div><Button href="/agent/restaurants/new" size="dense">Add restaurant</Button></div>
          </Panel>
        ) : (
          <EmptyState
            kind="zero-result"
            lang="en"
            things="restaurants"
            query={q || 'anything'}
            filter={filterLabel}
            action={<Button href="/agent" size="dense" variant="ghost">{t('empty.clearFilters', 'en')}</Button>}
          />
        )
      ) : (
        <div className={c.tableWrap}>
          <table className={c.table}>
            <thead>
              <tr>
                <th>Restaurant</th>
                <th>Status</th>
                <th>Stage</th>
                <th className={c.right}>Outlets</th>
                <th>Last order</th>
                <th className={c.right}>Needs attention</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <a href={`/agent/restaurants/${r.id}`}>{r.name}</a>{' '}
                    <span className={`${c.muted} num`}>/r/{r.slug}</span>
                  </td>
                  <td><Tag tone={r.status === 'active' || r.status === 'suspended' ? 'strong' : r.status === 'churned' ? 'quiet' : 'default'}>{capitalise(r.status)}</Tag></td>
                  <td>{STAGE_LABEL[r.stage]}</td>
                  <td className={`${c.right} num`}>{r.outletCount}</td>
                  <td className={`${c.nowrap} num`}>{fmtIst(r.lastOrderAt)}</td>
                  <td className={`${c.right} num`}>
                    {r.needsAttentionCount > 0 ? <strong>{r.needsAttentionCount}</strong> : <span className={c.muted}>0</span>}
                  </td>
                  <td className={`${c.nowrap} num`}>{fmtIst(r.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
