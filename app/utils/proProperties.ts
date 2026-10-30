/**
 * Vocabulaire commun à la liste « Mes biens » et à la fiche d'un bien.
 *
 * Deux notions distinctes, à ne pas mélanger :
 * - la **visibilité** dans la recherche, qui dépend uniquement des logements
 *   (un logement non occupé suffit) — c'est ce qui intéresse le propriétaire ;
 * - l'**état du bâtiment** (`property.status`), purement informatif.
 */

export type ListingState = 'incomplete' | 'online' | 'full'

interface UnitLike { unit_status: string }

/** `incomplete` : aucun logement (rien à publier) · `online` : au moins un logement non occupé · `full` : tout est occupé. */
export function listingState(units: UnitLike[]): ListingState {
  if (!units.length) return 'incomplete'
  return units.some(u => u.unit_status !== 'occupied') ? 'online' : 'full'
}

export const LISTING_LABEL: Record<ListingState, string> = {
  incomplete: 'Publication incomplète',
  online: 'Visible dans la recherche',
  full: 'Hors recherche'
}

/** Explication courte, affichée sous le libellé. */
export const LISTING_HINT: Record<ListingState, string> = {
  incomplete: "aucun logement : ajoutez-en un pour apparaître dans la recherche",
  online: 'au moins un logement est libre',
  full: 'tous les logements sont occupés'
}

export const LISTING_TONE: Record<ListingState, 'ok' | 'warn' | 'neutral'> = {
  incomplete: 'warn',
  online: 'ok',
  full: 'neutral'
}

/** Filtre de la liste, tel qu'il apparaît dans l'URL (`?statut=`). */
export const LISTING_FILTER: Record<string, ListingState> = {
  'en-ligne': 'online',
  'hors-recherche': 'full',
  incomplet: 'incomplete'
}

/** État du bâtiment — mêmes mots dans la liste et dans le formulaire de la fiche. */
export const PROPERTY_STATUS_LABEL: Record<string, string> = {
  available: 'Disponible',
  occupied: 'Entièrement occupé',
  maintenance: 'En travaux'
}

/** État d'un logement (badge de la fiche et des listes). */
export const UNIT_STATUS_LABEL: Record<string, string> = {
  available: 'Libre',
  occupied: 'Occupée',
  notice_given: 'Préavis en cours',
  maintenance: 'En maintenance',
  coming_soon: 'Bientôt disponible'
}

/** Recherche plein texte de la liste : nom, quartier, ville. */
export function matchesPropertyQuery(p: { name: string; neighborhood?: { name: string } | null; city?: { name: string } | null }, q: string): boolean {
  const needle = q.trim().toLowerCase()
  if (!needle) return true
  return [p.name, p.neighborhood?.name, p.city?.name].some(f => (f ?? '').toLowerCase().includes(needle))
}

/** Photos sous le minimum demandé à la publication (5) : on prévient avant d'en retirer une. */
export const MIN_PROPERTY_PHOTOS = 5
export function photoRemovalWarning(currentCount: number): string | null {
  const after = currentCount - 1
  if (after >= MIN_PROPERTY_PHOTOS) return null
  if (after === 0) return "Le bien n'aura plus aucune photo : l'annonce s'affichera sans image."
  return `Il restera ${after} photo${after > 1 ? 's' : ''}, sous le minimum de ${MIN_PROPERTY_PHOTOS} demandé pour une annonce : elle recevra moins de demandes.`
}
