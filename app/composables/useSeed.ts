export const SEEDS = ['purple', 'blue', 'teal', 'green'] as const
export type Seed = typeof SEEDS[number]

export const SEED_HEX: Record<Seed, string> = {
  purple: '#6750A4',
  blue: '#415F91',
  teal: '#006A6B',
  green: '#3F6837',
}

/**
 * Accent ("seed") color preference. Stored in a cookie so SSR can set the
 * [data-seed] attribute on <html> (md3-tokens.css keys accents off it),
 * avoiding any flash of the wrong palette.
 */
export function useSeed() {
  const seed = useCookie<Seed>('ap-seed', {
    default: () => 'purple',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  })

  function setSeed(next: Seed) {
    seed.value = SEEDS.includes(next) ? next : 'purple'
  }

  return { seed, setSeed, seeds: SEEDS, hex: SEED_HEX }
}
