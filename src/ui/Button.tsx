import { Button as AstryxButton } from '@astryxdesign/core/Button'
import { Children, isValidElement, type ComponentPropsWithoutRef, type ReactNode } from 'react'
import styles from './Button.module.css'

export type Variant = 'primary' | 'ghost' | 'brand' | 'danger'
export type Size = 'customer' | 'counter' | 'dense'

type Base = {
  /**
   * primary — Astryx `primary`, the accent plate; the default everywhere but the customer CTA.
   * brand   — Astryx `primary` repainted with `--brand-fill` / `--brand-on`; the customer
   *           surface's primary CTA only (design §3.5).
   * ghost   — Astryx `ghost` plus a `--border-control` outline: a bordered, unfilled button.
   *           Not Astryx `secondary`, which the neutral theme paints as a filled grey plate.
   * danger  — Astryx `destructive`; permitted only inside a destructive confirm (design §11.1).
   */
  variant?: Variant
  /**
   * Touch-target height: 44 / 56 / 32 (design §6.1). Astryx's own sizes are 28 / 32 / 36, which
   * are desktop-mouse sizes; the module overrides the height so the customer and counter surfaces
   * keep targets a thumb can hit.
   */
  size?: Size
  /** Full width. */
  block?: boolean
  /**
   * The accessible name, when `children` is not plain text. Astryx requires a string label; when
   * this is omitted it is taken from the text inside `children`.
   */
  label?: string
  className?: string
  children: ReactNode
}

type ButtonProps = Base & Omit<ComponentPropsWithoutRef<'button'>, 'className' | 'children'> & { href?: undefined }
type AnchorProps = Base & Omit<ComponentPropsWithoutRef<'a'>, 'className' | 'children'> & { href: string }

const VARIANT = { primary: 'primary', brand: 'primary', ghost: 'ghost', danger: 'destructive' } as const
const SIZE = { customer: 'lg', counter: 'lg', dense: 'sm' } as const

/** The text a screen reader would read out of `node`, for Astryx's required `label`. */
function textOf(node: ReactNode): string {
  let out = ''
  Children.forEach(node, (child) => {
    if (typeof child === 'string' || typeof child === 'number') out += String(child)
    else if (isValidElement<{ children?: ReactNode }>(child)) out += textOf(child.props.children)
  })
  return out
}

/**
 * The one Button in this codebase (CLAUDE.md), now a thin adapter over Astryx's (ADR 0010). It
 * keeps ServeLine's variant and size vocabulary so the forty-odd call sites did not change, and it
 * still renders a real `<a>` when `href` is given (Astryx routes it through the Next.js Link set in
 * `<Providers>`), otherwise a `<button>` that submits a server-action form like any other.
 *
 * `disabled` and `aria-disabled` both become Astryx's `isDisabled`, which disables with
 * aria-disabled and keeps the button focusable — the behaviour the pending-form call sites wanted.
 */
export function Button(props: ButtonProps | AnchorProps) {
  const { variant = 'primary', size = 'customer', block = false, label, className, children, ...rest } = props
  const cls = [styles.btn, styles[size], variant === 'brand' || variant === 'ghost' ? styles[variant] : '', className ?? '']
    .filter(Boolean)
    .join(' ')
  const name = label ?? textOf(children)
  const visible = typeof children === 'string' ? undefined : children
  const common = {
    label: name,
    variant: VARIANT[variant],
    size: SIZE[size],
    width: block ? '100%' : undefined,
    className: cls,
  }

  if (rest.href !== undefined) {
    const { href, ...anchor } = rest as Omit<AnchorProps, keyof Base>
    return (
      <AstryxButton {...common} {...(anchor as object)} href={href}>
        {visible}
      </AstryxButton>
    )
  }
  const { type = 'button', disabled, 'aria-disabled': ariaDisabled, ...button } = rest as Omit<ButtonProps, keyof Base>
  return (
    <AstryxButton
      {...common}
      {...(button as object)}
      type={type}
      isDisabled={Boolean(disabled) || ariaDisabled === true || ariaDisabled === 'true'}
    >
      {visible}
    </AstryxButton>
  )
}
