import { t, type Lang } from './i18n.ts'
import styles from './FssaiMark.module.css'

/**
 * The FSSAI veg / non-veg mark, 14×14 (design §7.3). Regulated and instantly parsed by every
 * Indian diner: a green square with a dot, a brown square with a triangle. Inline SVG with a
 * <title>; the colours are the two reserved `--fssai-*` tokens, nothing else.
 */
export function FssaiMark({ veg, lang = 'en' }: { veg: boolean; lang?: Lang }) {
  return (
    <svg
      className={`${styles.mark} ${veg ? styles.veg : styles.nonveg}`}
      width="14"
      height="14"
      viewBox="0 0 14 14"
      role="img"
    >
      <title>{t(veg ? 'menu.veg' : 'menu.nonveg', lang)}</title>
      <rect x="0.75" y="0.75" width="12.5" height="12.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      {veg ? (
        <circle cx="7" cy="7" r="3.5" fill="currentColor" />
      ) : (
        <path d="M7 3.25L10.75 10.25H3.25z" fill="currentColor" />
      )}
    </svg>
  )
}
