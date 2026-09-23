import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Join class names, letting a later Tailwind utility beat an earlier one of the same kind.
 *
 * Only `src/ui/primitives/*` — the ShadCN components — should need this. Everything else in
 * `src/ui` styles itself through its own CSS module and has no class strings to merge.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
