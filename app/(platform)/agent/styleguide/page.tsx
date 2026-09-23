import { cookies } from 'next/headers'
import type { ReactNode } from 'react'
import { ORDER_TRANSITIONS, type Fulfilment, type OrderStatus } from '@/core/orders.ts'
import { Band } from '@/ui/Band.tsx'
import { Button } from '@/ui/Button.tsx'
import { CartBar } from '@/ui/CartBar.tsx'
import { EmptyState } from '@/ui/EmptyState.tsx'
import { Field } from '@/ui/Field.tsx'
import fieldStyles from '@/ui/Field.module.css'
import { FssaiMark } from '@/ui/FssaiMark.tsx'
import { type Lang, t } from '@/ui/i18n.ts'
import { MenuItemRow, type MenuItemView } from '@/ui/MenuItemRow.tsx'
import type { OrderCardData } from '@/ui/OrderCard.tsx'
import { OtpInput } from '@/ui/OtpInput.tsx'
import { PhoneInput } from '@/ui/PhoneInput.tsx'
import { StateGlyph } from '@/ui/StateGlyph.tsx'
import { StatusChip } from '@/ui/StatusChip.tsx'
import { ThemeToggle } from '@/ui/ThemeToggle.tsx'
import { AGENT_THEME_COOKIE, isTheme } from '@/ui/theme.ts'
import { PageHead } from '../bits.tsx'
import { setPlatformTheme } from '../(console)/actions.ts'
import {
  AlertDialogDemo, DialogDemo, DropdownDemo, LiveOrderCard, MenuDemo, PopoverDemo, ResendDemo,
  SelectDemo, StepperDemo, SwitchDemo, TabsDemo, ToastDemo, TooltipDemo,
} from './demos.tsx'

export const metadata = { title: 'ServeLine styleguide' }

const STATUSES = Object.keys(ORDER_TRANSITIONS) as OrderStatus[]
const LANGS: Lang[] = ['en', 'hi', 'kn']
const FULFILMENTS: Fulfilment[] = ['delivery', 'pickup', 'dine_in']

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000)

const baseOrder: OrderCardData = {
  id: 'demo',
  number: '1284',
  status: 'received',
  fulfilment: 'dine_in',
  channel: 'page_table',
  tableNo: '7',
  placedAt: minutesAgo(4),
  totalPaise: 64_000,
  paymentMethod: 'pay_at_table',
  paymentStatus: 'unpaid',
  items: [
    { qty: 2, name: 'Paneer Butter Masala', variant: 'Full' },
    { qty: 1, name: 'Butter Naan', options: ['Extra butter'] },
  ],
  notes: 'Less spicy',
  customerPhone: '+919876543210',
}

const delivery: OrderCardData = {
  ...baseOrder,
  number: '1285',
  fulfilment: 'delivery',
  channel: 'page_delivery',
  tableNo: null,
  area: 'Koramangala 5th Block',
  paymentMethod: 'upi_link',
  paymentStatus: 'paid',
  addressText: '12, 4th Cross, Koramangala 5th Block, 560095 — near the bakery',
}

const menuItems: MenuItemView[] = [
  { id: 'paneer-tikka', name: 'Paneer Tikka', description: 'Char-grilled cottage cheese with mint chutney', pricePaise: 26_000, isVeg: true, isAvailable: true },
  { id: 'chicken-65', name: 'Chicken 65', description: 'Andhra-style, fried with curry leaves and green chilli, served with onion rings and lemon wedges — a long description to show the two-line clamp.', pricePaise: 29_000, isVeg: false, isAvailable: true },
  { id: 'bisi-bele', name: 'ಬಿಸಿ ಬೇಳೆ ಬಾತ್', description: 'Bisi bele bath, with boondi', pricePaise: 18_000, isVeg: true, isAvailable: true },
  { id: 'gobi', name: 'Gobi Manchurian', pricePaise: 22_000, isVeg: true, isAvailable: false },
]

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="grid gap-[var(--space-16)]">
      <header>
        {/* `font-bold` emitted a literal 700 into the stylesheet — the one weight in this file that
            was not a token. --fw-bold is the same 700 and moves with tokens.css if it ever changes. */}
        <h2 className="m-0" style={{ fontSize: 'var(--text-title)', fontWeight: 'var(--fw-bold)' }}>{title}</h2>
        {note && <p className="m-0" style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-label)' }}>{note}</p>}
      </header>
      {children}
    </section>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-[var(--space-8)]">
      <span style={{ fontSize: 'var(--text-caption)', color: 'var(--text-secondary)' }}>{label}</span>
      <div className="flex flex-wrap items-center gap-[var(--space-12)]">{children}</div>
    </div>
  )
}

/** Every component in every state, on one screen. This page is the UI layer's test. */
export default async function StyleguidePage() {
  // The styleguide shows the control that ships, not a lookalike: a page documenting the
  // design system should not be the one place in the product where a component behaves
  // differently. The previous demo mutated document.documentElement and persisted nothing.
  const chosenTheme = (await cookies()).get(AGENT_THEME_COOKIE)?.value
  const theme = isTheme(chosenTheme) ? chosenTheme : 'os'
  return (
    <main className="mx-auto max-w-[960px] grid gap-[var(--space-48)] px-[var(--space-20)] py-[var(--space-32)]">
      <PageHead
        title={<>Steel &amp; Enamel</>}
        meta="Every component, every state. Sections are wrapped in their native density; the toggle re-renders the whole page from the tokens, which is how both themes get checked."
        actions={
          <ThemeToggle
            action={setPlatformTheme}
            current={theme}
            size="dense"
            legend="Theme"
            labels={{ os: 'OS', light: 'Light', dark: 'Dark' }}
          />
        }
      />

      <Section title="ThemeToggle" note="ADR 0002 §3 — the staff light/dark control, one per surface. Three submit buttons and a cookie, so the choice survives a reload and works with no JavaScript. Pressed state is aria-pressed, never colour alone.">
        <Row label="dense (console)">
          <ThemeToggle action={setPlatformTheme} current={theme} size="dense" legend="Theme" labels={{ os: 'OS', light: 'Light', dark: 'Dark' }} />
        </Row>
        <div data-density="counter">
          <Row label="counter (dashboard)">
            <ThemeToggle action={setPlatformTheme} current={theme} size="counter" legend="Theme" labels={{ os: 'OS', light: 'Light', dark: 'Dark' }} />
          </Row>
        </div>
      </Section>

      <Section title="StateGlyph" note="§3.3 — six inline SVGs, each with a <title>. Shape, not colour alone.">
        <Row label="six tones (coloured by the parent)">
          {(['received', 'preparing', 'ready', 'delivered', 'needs_attention', 'cancelled'] as const).map((s) => (
            <span key={s} className="inline-flex items-center gap-[var(--space-6)]" style={{ color: `var(--state-${s === 'needs_attention' ? 'attention' : s}-ink)` }}>
              <StateGlyph status={s} />
              <span className="num" style={{ fontSize: 'var(--text-caption)' }}>{s}</span>
            </span>
          ))}
        </Row>
      </Section>

      <Section title="StatusChip" note="§7.2 — 4px radius rectangle, never a pill. Filled at the counter, outline for the customer and dense tables.">
        {(['outline', 'filled'] as const).map((variant) => (
          <div key={variant} data-density={variant === 'filled' ? 'counter' : 'dense'} className="grid gap-[var(--space-8)]">
            <Row label={`${variant} · en`}>
              {STATUSES.map((s) => <StatusChip key={s} status={s} fulfilment="delivery" variant={variant} lang="en" />)}
            </Row>
          </div>
        ))}
        <div data-density="comfort" className="grid gap-[var(--space-8)]">
          <Row label="outline · hi (interim translation, not native-reviewed)">
            {STATUSES.map((s) => <StatusChip key={s} status={s} fulfilment="delivery" variant="outline" lang="hi" />)}
          </Row>
          <Row label="outline · kn (interim translation, not native-reviewed)">
            {STATUSES.map((s) => <StatusChip key={s} status={s} fulfilment="delivery" variant="outline" lang="kn" />)}
          </Row>
          <Row label="delivered by fulfilment (ADR 0002 §6)">
            {FULFILMENTS.map((f) => <StatusChip key={f} status="delivered" fulfilment={f} variant="outline" lang="en" />)}
          </Row>
        </div>
      </Section>

      <Section title="Button" note="primary = --action-fill with the bevel · brand = customer CTA only · ghost · danger only inside a confirm.">
        {(['customer', 'counter', 'dense'] as const).map((size) => (
          <Row key={size} label={size}>
            <Button size={size} variant="primary">Accept order</Button>
            <Button size={size} variant="brand">Place order</Button>
            <Button size={size} variant="ghost">Keep order</Button>
            <Button size={size} variant="danger">Cancel order</Button>
            <Button size={size} variant="primary" disabled>Saving…</Button>
            <Button size={size} variant="ghost" href="tel:+919876543210">Call (link)</Button>
          </Row>
        ))}
        <Row label="block">
          <div className="w-full max-w-[420px]"><Button size="counter" block>Mark ready</Button></div>
        </Row>
      </Section>

      <Section title="Band" note="§7.10.1, §8 — persistent, never a toast. The received band pulses exactly 3 cycles on mount.">
        <div className="grid gap-[var(--space-12)]" data-density="counter">
          <Band tone="attention" action={<Button size="dense" variant="ghost">{t('net.retry', 'en')}</Button>}>{t('net.offline', 'en')}</Band>
          <Band tone="received" pulse>{t('board.newOrders', 'en', { n: 2 })}</Band>
          <Band tone="neutral" action={<Button size="dense" variant="ghost">Reopen</Button>}>{t('nag.collapsed', 'en')} →</Band>
        </div>
      </Section>

      <Section title="EmptyState" note="§7.9 — three kinds, three components. Never “Nothing here.”">
        <div data-density="counter" className="grid gap-[var(--space-16)]">
          <EmptyState kind="first-run" lang="en" action={<Button size="counter">{t('empty.previewPage', 'en')}</Button>} />
          <EmptyState kind="all-done" lang="en" ordersToday={14} />
        </div>
        <div data-density="dense">
          <EmptyState kind="zero-result" lang="en" things="restaurants" query="Koramangala" filter="Onboarding" action={<Button size="dense" variant="ghost" href="/agent/styleguide">{t('empty.clearFilters', 'en')}</Button>} />
        </div>
      </Section>

      <Section title="FssaiMark" note="§7.3 — regulated marks, 14×14, the two reserved tokens.">
        <Row label="veg / non-veg">
          <span className="inline-flex items-center gap-[var(--space-6)]"><FssaiMark veg /> Vegetarian</span>
          <span className="inline-flex items-center gap-[var(--space-6)]"><FssaiMark veg={false} /> Non-vegetarian</span>
        </Row>
      </Section>

      <Section title="Field · PhoneInput · OtpInput" note="§7.5, §7.6, §7.10.3 — visible labels always; error below in attention ink; the field keeps its value.">
        <div data-density="comfort" className="grid gap-[var(--space-24)] max-w-[420px]">
          <Field id="sg-name" label="Name" hint="As it should appear on the bill">
            {(p) => <input {...p} className={fieldStyles.control} type="text" defaultValue="Anita" />}
          </Field>
          <Field id="sg-pin" label="Pincode" error="We do not deliver to 560001 yet">
            {(p) => <input {...p} className={`${fieldStyles.control} num`} type="text" inputMode="numeric" defaultValue="560001" />}
          </Field>
          <PhoneInput lang="en" id="sg-phone-1" />
          <PhoneInput lang="hi" id="sg-phone-2" defaultValue="98765" error={t('login.phoneInvalid', 'hi')} />
          <OtpInput lang="en" id="sg-otp-1" hint={t('otp.help', 'en', { phone: '98765 43210' })} />
          <OtpInput lang="en" id="sg-otp-2" error={t('otp.wrong', 'en')} />
          <ResendDemo />
        </div>
      </Section>

      <Section title="QtyStepper" note="§7.7 — minus becomes remove at 1; tap the number to type; max shows a message, never a silently disabled button.">
        <Row label="customer (44) · qty 1 → remove"><StepperDemo size="customer" start={1} /></Row>
        <Row label="customer (44) · mid"><StepperDemo size="customer" start={4} /></Row>
        <Row label="customer (44) · at max"><StepperDemo size="customer" start={20} /></Row>
        <div data-density="counter"><Row label="counter (56)"><StepperDemo size="counter" start={2} /></Row></div>
      </Section>

      <Section title="MenuItemRow" note="§7.3 — 72px min, FSSAI leading, ADD swaps in place for the stepper; out-of-stock by token, never opacity.">
        <div data-density="comfort" className="grid gap-[var(--space-16)]">
          <MenuDemo items={menuItems} lang="en" />
          <Row label="read-only (no onQtyChange)">
            <ul className="m-0 p-0 list-none w-full rounded-[var(--radius-4)] overflow-hidden">
              <MenuItemRow item={menuItems[0]!} lang="kn" />
            </ul>
          </Row>
        </div>
      </Section>

      <Section title="OrderCard" note="§7.1 — all eight states. Tap the lean-in row to expand; ⋯ for cancel behind a one-step confirm.">
        <div data-density="counter" className="grid gap-[var(--space-8)] max-w-[480px]">
          <Row label="default (received, dine-in) — resolves in 500ms"><div className="w-full"><LiveOrderCard order={baseOrder} lang="en" /></div></Row>
          <Row label="updating — resolves in 4s"><div className="w-full"><LiveOrderCard order={{ ...delivery, number: '1286', status: 'confirmed' }} lang="en" mode="slow" /></div></Row>
          <Row label="failed to sync — rejects"><div className="w-full"><LiveOrderCard order={{ ...baseOrder, number: '1287', status: 'preparing', placedAt: minutesAgo(11) }} lang="en" mode="fail" /></div></Row>
          <Row label="needs attention"><div className="w-full"><LiveOrderCard order={{ ...delivery, number: '1288', status: 'needs_attention', channel: 'ai_call', attentionReason: 'Customer has not answered 2 calls', placedAt: minutesAgo(9) }} lang="en" /></div></Row>
          <Row label="pinned (address pending)"><div className="w-full"><LiveOrderCard order={{ ...delivery, number: '1289', status: 'address_pending', channel: 'ai_call', area: 'HSR Layout (rough)', paymentStatus: 'awaiting', placedAt: minutesAgo(2) }} lang="en" /></div></Row>
          <Row label="ready (delivery) → Out for delivery"><div className="w-full"><LiveOrderCard order={{ ...delivery, number: '1290', status: 'ready', placedAt: minutesAgo(23) }} lang="en" /></div></Row>
          <Row label="ready (pickup) → Mark collected"><div className="w-full"><LiveOrderCard order={{ ...baseOrder, number: '1291', status: 'ready', fulfilment: 'pickup', channel: 'staff_manual', paymentMethod: 'cod', placedAt: minutesAgo(17) }} lang="en" /></div></Row>
          <Row label="awaiting payment"><div className="w-full"><LiveOrderCard order={{ ...delivery, number: '1292', status: 'awaiting_payment', paymentStatus: 'awaiting', placedAt: minutesAgo(1) }} lang="en" /></div></Row>
          <Row label="Hindi labels"><div className="w-full"><LiveOrderCard order={{ ...baseOrder, number: '1293', status: 'confirmed' }} lang="hi" /></div></Row>
          <Row label="delivered (collapsed, drained)"><div className="w-full"><LiveOrderCard order={{ ...delivery, number: '1280', status: 'delivered', placedAt: minutesAgo(65) }} lang="en" /></div></Row>
          <Row label="cancelled (collapsed, drained)"><div className="w-full"><LiveOrderCard order={{ ...baseOrder, number: '1279', status: 'cancelled', placedAt: minutesAgo(80) }} lang="en" /></div></Row>
        </div>
      </Section>

      <Section title="Primitives (ShadCN)" note="ADR 0008 — Radix behaviour, Steel &amp; Enamel palette. Every utility they use resolves to a token through shadcn-bridge.css, so they are correct in both themes with no `dark:` anywhere. Open each one in both themes; that is what this section is for.">
        <div data-density="dense" className="grid gap-[var(--space-16)]">
          <Row label="Select · Switch + Label">
            <SelectDemo />
            <SwitchDemo />
          </Row>
          <Row label="Tabs"><TabsDemo /></Row>
          <Row label="DropdownMenu · Popover · Tooltip">
            <DropdownDemo />
            <PopoverDemo />
            <TooltipDemo />
          </Row>
          <Row label="Dialog (steel plate) · AlertDialog (danger — the only permitted modal, §11.20)">
            <DialogDemo />
            <AlertDialogDemo />
          </Row>
          <Row label="Sonner — a confirmation that has nothing to retry; an error with a retry is a Band (§11.15)">
            <ToastDemo />
          </Row>
        </div>
      </Section>

      <Section title="CartBar" note="§7.4 — fixed to the bottom of this page, 64px + safe-area, one tap target. Not rendered at all when count is 0.">
        <p className="m-0" style={{ color: 'var(--text-secondary)' }}>See the bottom of the viewport. The zero-count variant renders nothing: <CartBar count={0} totalPaise={0} href="#cart" lang="en" />.</p>
      </Section>

      <div data-density="comfort">
        <CartBar count={3} totalPaise={64_000} href="#cart" lang="en" />
      </div>
    </main>
  )
}
