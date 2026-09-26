/**
 * Règles partagées par l'assistant de création (`pro/biens/ajouter.vue`),
 * la fiche d'un bien et la modale d'unité — toutes vérifiées en live contre
 * l'API de production (Lot 45).
 */

/** Loi 2022-30 — l'API refuse au-delà (`validation.CAUTION_TOO_HIGH` / `AVANCE_TOO_HIGH`), sans dérogation possible. */
export const LEGAL_MAX_MONTHS = 3

export function validateMonths(label: string, value: string): string | null {
  const v = value.trim()
  if (!v) return null
  const n = Number(v)
  if (!Number.isInteger(n) || n < 0) return `${label} : saisissez un nombre entier de mois.`
  if (n > LEGAL_MAX_MONTHS) return `${label} : la loi 2022-30 plafonne à ${LEGAL_MAX_MONTHS} mois.`
  return null
}

/**
 * Mode de location choisi par le propriétaire. L'API n'a pas de champ unique
 * pour ça : c'est la grille tarifaire (`/units/:id/pricing`) qui classe une
 * unité « à la nuit » ou « au mois » dans la recherche et sur l'accueil (voir
 * `classifyRental`). Une unité à la nuit sans tarif journalier était donc
 * rangée « au mois » à son prix de base.
 */
export type RentalChoice = 'mois' | 'nuit' | 'les_deux'

export const RENTAL_CHOICES: { key: RentalChoice; label: string; hint: string }[] = [
  { key: 'mois', label: 'Au mois', hint: 'Location longue durée avec bail' },
  { key: 'nuit', label: 'À la nuit', hint: 'Séjours courts, souvent meublé' },
  { key: 'les_deux', label: 'Les deux', hint: 'Au mois et à la nuit' }
]

export interface PricingRow {
  billing_frequency: 'daily' | 'monthly'
  price: number
}

/**
 * Champs d'unité + lignes de tarif à créer pour un mode donné.
 * - `mois` : prix de base = loyer, aucune grille (classé « au mois » à ce prix).
 * - `nuit` : prix de base = prix de la nuit + tarif journalier, séjour minimum 1 nuit.
 * - `les_deux` : prix de base = loyer + tarifs mensuel ET journalier (sans le
 *   mensuel explicite, une unité ayant un tarif journalier n'est plus classée « au mois »).
 */
export function rentalSetup(choice: RentalChoice, monthly: number | null, nightly: number | null): {
  price: number
  min_duration_days: number
  characteristics: { billing_type: 'monthly' | 'daily' }
  pricing: PricingRow[]
} {
  if (choice === 'nuit') {
    const n = nightly ?? 0
    return { price: n, min_duration_days: 1, characteristics: { billing_type: 'daily' }, pricing: [{ billing_frequency: 'daily', price: n }] }
  }
  if (choice === 'les_deux') {
    const m = monthly ?? 0
    const n = nightly ?? 0
    return {
      price: m,
      min_duration_days: 1,
      characteristics: { billing_type: 'monthly' },
      pricing: [{ billing_frequency: 'monthly', price: m }, { billing_frequency: 'daily', price: n }]
    }
  }
  const m = monthly ?? 0
  return { price: m, min_duration_days: 30, characteristics: { billing_type: 'monthly' }, pricing: [] }
}

export function validateRentalPrices(choice: RentalChoice, monthly: string, nightly: string): string | null {
  const needMonthly = choice !== 'nuit'
  const needNightly = choice !== 'mois'
  if (needMonthly && !(Number(monthly) > 0)) return 'Renseignez le loyer mensuel.'
  if (needNightly && !(Number(nightly) > 0)) return 'Renseignez le prix par nuit.'
  return null
}

/** Mode déduit d'une unité existante (modale d'édition) — la grille fait foi, `billing_type` à défaut. */
export function rentalChoiceOf(pricing: { billing_frequency: string; is_available: boolean }[], billingType?: string | null): RentalChoice {
  const active = pricing.filter(p => p.is_available)
  const daily = active.some(p => p.billing_frequency === 'daily')
  const longTerm = active.some(p => p.billing_frequency !== 'daily' && p.billing_frequency !== 'weekly')
  if (daily && longTerm) return 'les_deux'
  if (daily) return 'nuit'
  if (!active.length && billingType === 'daily') return 'nuit'
  return 'mois'
}

/**
 * Photos : aucune route ne supprime ou ne réordonne un média — seul
 * `PATCH /property/:id { images }` remplace toute la liste (les fichiers
 * retirés sont effacés du stockage, vérifié en live). `rank` commence à 1
 * (l'API refuse 0) et une seule photo est principale.
 */
export function imagesPayload(
  media: { id: string; url: string; is_primary: boolean; rank?: number }[],
  change: { removeId?: string; primaryId?: string }
): { url: string; rank: number; is_primary: boolean }[] {
  const kept = media.filter(m => m.id !== change.removeId)
  const primaryId = change.primaryId && kept.some(m => m.id === change.primaryId)
    ? change.primaryId
    : (kept.find(m => m.is_primary) ?? kept[0])?.id
  const ordered = [...kept.filter(m => m.id === primaryId), ...kept.filter(m => m.id !== primaryId)]
  return ordered.map((m, i) => ({ url: m.url, rank: i + 1, is_primary: m.id === primaryId }))
}

/**
 * L'API supprime un bien ou une unité même occupée (constaté en live, aucun
 * contrôle de bail actif) — le garde-fou est donc côté écran.
 */
export function deleteBlocker(units: { unit_status: string }[]): string | null {
  const busy = units.filter(u => u.unit_status === 'occupied' || u.unit_status === 'notice_given').length
  if (!busy) return null
  return busy > 1
    ? `${busy} unités sont occupées ou en préavis : terminez d'abord les baux concernés.`
    : "Une unité est occupée ou en préavis : terminez d'abord le bail concerné."
}

/** Caractéristiques du bâtiment acceptées par l'API (`PROPERTY_CHARS`, les autres clés sont ignorées). */
export const PROPERTY_CHARACTERISTICS: { key: string; label: string }[] = [
  { key: 'is_fenced', label: 'Clôturé' },
  { key: 'has_guardian', label: 'Gardien' },
  { key: 'has_parking', label: 'Parking' },
  { key: 'has_garden', label: 'Jardin / cour' },
  { key: 'has_water_tank', label: "Château d'eau / citerne" }
]

/** `PoiType` du backend (points-of-interest). */
export const POI_TYPES: { code: string; label: string }[] = [
  { code: 'mosque', label: 'Mosquée' },
  { code: 'church', label: 'Église' },
  { code: 'bar', label: 'Bar / maquis' },
  { code: 'nightclub', label: 'Boîte de nuit' },
  { code: 'school', label: 'École' },
  { code: 'market', label: 'Marché' },
  { code: 'hospital', label: 'Hôpital / centre de santé' },
  { code: 'bus_stop', label: 'Arrêt / gare' },
  { code: 'police', label: 'Commissariat' },
  { code: 'factory', label: 'Usine' },
  { code: 'stadium', label: 'Stade' },
  { code: 'cemetery', label: 'Cimetière' },
  { code: 'restaurant', label: 'Restaurant' },
  { code: 'noise_source', label: 'Source de bruit' },
  { code: 'autre', label: 'Autre' }
]

export const NOISE_LEVELS: { code: string; label: string }[] = [
  { code: 'none', label: 'Aucun bruit' },
  { code: 'low', label: 'Bruit faible' },
  { code: 'medium', label: 'Bruit modéré' },
  { code: 'high', label: 'Bruit fort' }
]
