import type { UnitPricing } from '~/types/property'

export interface RentalMode {
  /** Prix par nuit si un tarif journalier actif existe, sinon `null`. */
  nightly: number | null
  /** Loyer mensuel si l'unité se loue au mois, sinon `null`. */
  monthly: number | null
}

const LONG_TERM = ['monthly', 'quarterly', 'semi_annual', 'annual']

/**
 * `GET /property/search` ne dit pas si un logement se loue à la nuit ou au
 * mois — seule la grille tarifaire de l'unité (`GET /units/:id/pricing`) le
 * dit. Une unité sans aucune grille se loue au mois à son prix de base (le
 * loyer du bail) ; une unité qui n'a qu'un tarif journalier actif ne se loue
 * qu'à la nuit — son prix de base n'a alors pas de sens pour un visiteur.
 */
export function classifyRental(pricing: UnitPricing[], basePrice: number): RentalMode {
  const active = pricing.filter(p => p.is_available)
  const daily = active.find(p => p.billing_frequency === 'daily')
  const monthlyRow = active.find(p => p.billing_frequency === 'monthly')
  const hasLongTerm = active.some(p => LONG_TERM.includes(p.billing_frequency))

  const nightly = daily ? Number(daily.price) : null
  let monthly: number | null = null
  if (monthlyRow) monthly = Number(monthlyRow.price)
  else if (hasLongTerm || !daily) monthly = basePrice > 0 ? basePrice : null
  return { nightly, monthly }
}

export type RentalKey = 'nuit' | 'mois'
export const RENTAL_SUFFIX: Record<RentalKey, string> = { nuit: '/ nuit', mois: '/ mois' }

/** Prix et unité à afficher sur une carte hors filtre : le loyer mensuel s'il existe, sinon le prix à la nuit — jamais le prix de base d'une unité qui ne se loue qu'à la nuit. */
export function displayPrice(mode: RentalMode | undefined, basePrice: number): { price: number; suffix: string | undefined } {
  if (!mode) return { price: basePrice, suffix: undefined }
  if (mode.monthly !== null) return { price: mode.monthly, suffix: RENTAL_SUFFIX.mois }
  if (mode.nightly !== null) return { price: mode.nightly, suffix: RENTAL_SUFFIX.nuit }
  return { price: basePrice, suffix: undefined }
}

/**
 * Filtre côté client par type de location — l'API de recherche n'a pas ce
 * filtre. Le budget s'applique au prix du mode choisi (le `max_price`
 * serveur ne compare que le prix de base, faux pour une unité à la nuit).
 * Le tri par prix est refait sur ce même prix ; les tris par date gardent
 * l'ordre renvoyé par le serveur.
 */
export function filterByRental<T extends { unitId: string; price: number }>(
  cards: T[],
  modes: Record<string, RentalMode>,
  key: RentalKey,
  maxPrice: number | null,
  sort: 'newest' | 'oldest' | 'price_asc' | 'price_desc'
): T[] {
  const out: T[] = []
  for (const c of cards) {
    const m = modes[c.unitId]
    const price = m ? (key === 'nuit' ? m.nightly : m.monthly) : null
    if (price === null) continue
    if (maxPrice !== null && price > maxPrice) continue
    out.push({ ...c, price })
  }
  if (sort === 'price_asc') out.sort((a, b) => a.price - b.price)
  if (sort === 'price_desc') out.sort((a, b) => b.price - a.price)
  return out
}

/** Exécute `fn` sur chaque élément avec au plus `limit` appels simultanés — évite d'envoyer 40 requêtes d'un coup au backend. */
export async function mapLimited<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length)
  let next = 0
  async function worker() {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i]!)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}
