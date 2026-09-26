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
