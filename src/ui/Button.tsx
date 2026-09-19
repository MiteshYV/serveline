import type { ComponentPropsWithoutRef, ReactNode } from 'react'
import styles from './Button.module.css'

type Variant = 'primary' | 'ghost' | 'brand' | 'danger'
type Size = 'customer' | 'counter' | 'dense'

type Base = {
  /**
   * primary — `--action-fill`, the steel plate; the default everywhere but the customer CTA.
   * brand   — `--brand-fill` / `--brand-on`; the customer surface's primary CTA only (design §3.5).
   * ghost   — transparent with a control border.
   * danger  — attention plate; permitted only inside a destructive confirm (design §3.4, §11.1).
   */
  variant?: Variant
  /** Touch-target height: 44 / 56 / 32 (design §6.1). */
  size?: Size
  /** Full width. */
  block?: boolean
  className?: string
  children: ReactNode
}

type ButtonProps = Base & Omit<ComponentPropsWithoutRef<'button'>, 'className' | 'children'> & { href?: undefined }
type AnchorProps = Base & Omit<ComponentPropsWithoutRef<'a'>, 'className' | 'children'> & { href: string }

/** Renders an <a> when `href` is given (tel: links, route links), otherwise a <button>. */
export function Button(props: ButtonProps | AnchorProps) {
  const { variant = 'primary', size = 'customer', block = false, className, children, ...rest } = props
  const cls = [styles.btn, styles[variant], styles[size], block ? styles.block : '', className ?? '']
    .filter(Boolean)
    .join(' ')

  if (rest.href !== undefined) {
    const { href, ...anchor } = rest as Omit<AnchorProps, keyof Base>
    return (
      <a href={href} className={cls} {...anchor}>
        {children}
      </a>
    )
  }
  const { type = 'button', ...button } = rest as Omit<ButtonProps, keyof Base>
  return (
    <button type={type} className={cls} {...button}>
      {children}
    </button>
  )
}
