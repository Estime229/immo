import type { RefEntry } from '~/types/reference'

export type PropertyStatus = 'available' | 'occupied' | 'maintenance' | 'coming_soon'

export const PROPERTY_STATUS_LABELS: Record<PropertyStatus, string> = {
  available: 'Disponible',
  occupied: 'Occupé',
  maintenance: 'En travaux',
  coming_soon: 'Bientôt disponible'
}

/** États proposés à l'édition : `PATCH /property/:id` refuse `coming_soon` (« status must be one of: available, occupied, maintenance »). */
export const PROPERTY_EDIT_STATUSES: PropertyStatus[] = ['available', 'occupied', 'maintenance']

export const UNIT_STATUS_LABELS: Record<string, string> = {
  available: 'Libre',
  occupied: 'Occupé',
  notice_given: 'Préavis en cours',
  maintenance: 'En travaux',
  coming_soon: 'Bientôt libre'
}

/** Motifs fréquents proposés en puces ; l'admin peut les compléter. */
export const PROPERTY_SUSPEND_REASONS = [
  'Annonce frauduleuse ou trompeuse',
  'Photos sans rapport avec le bien',
  'Prix ou informations erronés',
  'Bien déjà loué ou indisponible',
  'Contenu inapproprié',
  'Signalements répétés'
] as const

export const UNIT_SUSPEND_REASONS = [
  'Logement déjà loué',
  'Photos sans rapport avec le logement',
  'Prix erroné',
  'Description trompeuse',
  'Signalements répétés'
] as const

export interface PropertyMedia {
  id: string
  url: string
  is_primary?: boolean
  type?: string
  rank?: number
}

export interface UnitMedia {
  id: string
  unit_id: string
  url: string
  type: string
  rank: number
  is_primary: boolean
  description: string | null
  created_at: string
  deleted_at: string | null
}

/** Personne résumée jointe par `GET /property/search` (`owner`, `agent`) — absente de `GET /property/:id`. */
export interface PropertyPersonRef {
  id: string
  first_name: string | null
  last_name: string | null
  avatar_url: string | null
}

// GET /property/search renvoie exactement la même forme riche que GET /property/{id}
// (owner_id, address, units[], is_suspended…) — vérifié en live, pas juste les champs
// minimaux qu'on affichait jusqu'ici sur la liste.
export type PropertyListItem = PropertyDetail

export interface PropertyListResponse {
  data: PropertyListItem[]
  total: number
  page: number
  limit: number
  totalPages: number
}

export interface PropertyUnit {
  id: string
  property_id: string | null
  owner_id: string | null
  ref_type_id: string
  /** Type de logement (référentiel UNIT_TYPE) — joint par `GET /property/:id`, pas par la recherche. */
  ref_type?: { code: string; labels: Record<string, string> } | null
  created_by: string
  name: string
  price: string
  toilet_type: string | null
  water_source: string | null
  meter_type: string | null
  furnished_level: string | null
  min_duration_days: number | null
  max_duration_days: number | null
  unit_status: string
  is_publicly_listed: boolean
  is_suspended?: boolean
  suspended_reason: string | null
  suspended_at: string | null
  available_from: string | null
  address: string | null
  neighborhood_id: string | null
  city_id: string | null
  gps_latitude: number | string | null
  gps_longitude: number | string | null
  surface_m2: number | null
  floor: number | null
  caution_months: number | null
  avance_months: number | null
  prepaye_months: number | null
  frais_dossier: string | null
  custom_fees: Record<string, unknown> | null
  bedrooms_count: number
  bathrooms_count: number
  description: Record<string, string> | null
  characteristics: Record<string, unknown> | null
  resolved_features?: Array<{ code: string; labels: Record<string, string> }>
  created_at: string
  updated_at: string
  deleted_at: string | null
  unit_media: UnitMedia[]
}

export interface PropertyDetail {
  id: string
  owner_id: string
  agent_id: string | null
  created_by: string | null
  name: string
  building_type: string
  address?: string | null
  neighborhood_id: string | null
  city_id: string
  /** L'API renvoie une chaîne (« 6.3916300 ») : passer par `preciseLocation`. */
  gps_latitude: number | string | null
  gps_longitude: number | string | null
  status: PropertyStatus
  is_publicly_listed: boolean
  is_suspended?: boolean
  suspended_reason?: string | null
  suspended_at?: string | null
  characteristics: Record<string, unknown> | null
  created_at: string
  updated_at: string
  deleted_at: string | null
  city: { id: string; name: string }
  neighborhood?: { id: string; name: string } | null
  units: PropertyUnit[]
  media: PropertyMedia[]
  main_image?: string | null
  description?: Record<string, string> | null
  owner?: PropertyPersonRef | null
  agent?: PropertyPersonRef | null
  /** Logement indépendant, sans bien parent : la recherche et `GET /property/:id` l'habillent en « bien » (vérifié en live). */
  _virtual?: boolean
}

export interface PropertyQuery {
  q?: string
  /** Nom de la ville (« Cotonou »), pas son id — vérifié en live. */
  city?: string
  status?: PropertyStatus
  owner_id?: string
  page?: number
  /** 100 au plus : au-delà, l'API répond 400. */
  limit?: number
}

export type PropertyRefs = Record<string, RefEntry[]>

export interface PropertyPhoto {
  url: string
  /** Nom du logement pour une photo de logement ; null pour une photo du bien. */
  caption: string | null
  primary: boolean
}

/** « meuble_basique » → « Meuble basique » : repli lisible tant qu'un référentiel n'a pas chargé. */
export function humanizeCode(code: string): string {
  return code.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase())
}

/** Libellé français d'un code de référentiel (type de bâtiment, ameublement…), chaîne vide si pas de code. */
export function refLabel(refs: PropertyRefs, type: string, code: string | null | undefined): string {
  if (!code) return ''
  return refs[type]?.find(e => e.code === code)?.labels.fr ?? humanizeCode(code)
}

/** Photos du bien puis de ses logements, principale d'abord, sans doublon : la modération regarde tout. */
export function propertyPhotos(p: Pick<PropertyDetail, 'media' | 'main_image' | 'units'>): PropertyPhoto[] {
  const seen = new Set<string>()
  const photos: PropertyPhoto[] = []
  const add = (url: string | null | undefined, caption: string | null, primary: boolean) => {
    if (!url || seen.has(url)) return
    seen.add(url)
    photos.push({ url, caption, primary })
  }
  const byPrimaryThenRank = (a: { is_primary?: boolean; rank?: number }, b: { is_primary?: boolean; rank?: number }) =>
    Number(!!b.is_primary) - Number(!!a.is_primary) || (a.rank ?? 0) - (b.rank ?? 0)

  const media = (p.media ?? []).filter(m => (m.type ?? 'image') === 'image').sort(byPrimaryThenRank)
  media.forEach(m => add(m.url, null, !!m.is_primary))
  if (!photos.length) add(p.main_image, null, true)
  for (const u of p.units ?? []) {
    const unitMedia = (u.unit_media ?? []).filter(m => (m.type ?? 'image') === 'image').sort(byPrimaryThenRank)
    unitMedia.forEach(m => add(m.url, u.name, false))
  }
  return photos
}

/** « 2 libres · 1 occupé · 1 en préavis » — chaîne vide sans logement. */
export function propertyUnitsSummary(units: Pick<PropertyUnit, 'unit_status'>[]): string {
  const count = (s: string) => units.filter(u => u.unit_status === s).length
  const parts: Array<[number, string, string]> = [
    [count('available'), 'libre', 'libres'],
    [count('occupied'), 'occupé', 'occupés'],
    [count('notice_given'), 'en préavis', 'en préavis'],
    [count('maintenance'), 'en travaux', 'en travaux'],
    [count('coming_soon'), 'bientôt libre', 'bientôt libres']
  ]
  return parts.filter(([n]) => n > 0).map(([n, one, many]) => `${n} ${n > 1 ? many : one}`).join(' · ')
}

/** Nombre de logements suspendus individuellement. */
export function suspendedUnitsCount(units: Pick<PropertyUnit, 'is_suspended'>[]): number {
  return units.filter(u => u.is_suspended).length
}

/** Prix de base d'un logement : à la nuit si la grille le classe ainsi (`billing_type: daily`), au mois sinon. */
export function unitPriceSuffix(u: Pick<PropertyUnit, 'characteristics'>): string {
  return u.characteristics?.billing_type === 'daily' ? '/ nuit' : '/ mois'
}

/** Fourchette des prix de base des logements ; `suffix` vide si le bien mélange nuit et mois. */
export function propertyRentRange(units: Pick<PropertyUnit, 'price' | 'characteristics'>[]): { min: number; max: number; suffix: string } | null {
  const priced = units.filter(u => Number(u.price) > 0)
  if (!priced.length) return null
  const prices = priced.map(u => Number(u.price))
  const suffixes = new Set(priced.map(unitPriceSuffix))
  return { min: Math.min(...prices), max: Math.max(...prices), suffix: suffixes.size === 1 ? [...suffixes][0]! : '' }
}

/**
 * Présence dans la recherche publique : un bien non suspendu ayant au moins un logement
 * non occupé et non suspendu (comportement de `search-properties.handler.ts`, voir BACKEND-ISSUES #6).
 */
export function isPropertyInSearch(p: Pick<PropertyDetail, 'is_suspended' | 'units'>): boolean {
  return !p.is_suspended && p.units.some(u => !u.is_suspended && u.unit_status !== 'occupied')
}

/** Le bien, ou au moins un de ses logements, est suspendu. */
export function propertyHasSuspension(p: Pick<PropertyDetail, 'is_suspended' | 'units'>): boolean {
  return !!p.is_suspended || p.units.some(u => u.is_suspended)
}

/** Raison d'empêcher la suppression (logement loué ou en préavis), ou null — l'API la refuse aussi depuis le correctif #5. */
export function propertyDeleteBlocker(units: Pick<PropertyUnit, 'unit_status'>[]): string | null {
  const busy = units.filter(u => u.unit_status === 'occupied' || u.unit_status === 'notice_given').length
  if (!busy) return null
  return busy > 1
    ? `Suppression impossible : ${busy} logements sont occupés ou en préavis. Leurs baux doivent d'abord être terminés ; en attendant, suspendez l'annonce.`
    : "Suppression impossible : un logement est occupé ou en préavis. Son bail doit d'abord être terminé ; en attendant, suspendez l'annonce."
}

export function useProperty() {
  const { apiFetch } = useApi()
  const refData = useReferenceData()

  function fetchProperties(query: PropertyQuery) {
    return apiFetch<PropertyListResponse>('/property/search', { query: { ...query } })
  }

  function fetchProperty(id: string) {
    return apiFetch<PropertyDetail>(`/property/${id}`)
  }

  // La réponse ne contient que les champs modifiés (`{ id, name, status }` d'après le swagger) :
  // recharger le bien plutôt que de la substituer à la fiche complète.
  function updateProperty(id: string, data: { name?: string; status?: PropertyStatus; description?: Record<string, string> }) {
    return apiFetch<PropertyDetail>(`/property/${id}`, { method: 'PATCH', body: data })
  }

  function deleteProperty(id: string) {
    return apiFetch(`/property/${id}`, { method: 'DELETE' })
  }

  function moderateProperty(id: string, isSuspended: boolean, reason?: string) {
    return apiFetch<{ id: string; is_suspended: boolean }>(`/property/${id}/moderation`, {
      method: 'PATCH',
      body: { is_suspended: isSuspended, reason }
    })
  }

  function moderateUnit(propertyId: string, unitId: string, isSuspended: boolean, reason?: string) {
    return apiFetch<{ id: string; is_suspended: boolean }>(`/property/${propertyId}/units/${unitId}/moderation`, {
      method: 'PATCH',
      body: { is_suspended: isSuspended, reason }
    })
  }

  /** Référentiels publics (mis en cache par useReferenceData) ; un référentiel en échec reste vide, le code s'affiche alors tel quel. */
  async function loadRefs(types: string[]): Promise<PropertyRefs> {
    const results = await Promise.allSettled(types.map(t => refData.fetchRef(t)))
    return Object.fromEntries(types.map((t, i) => {
      const r = results[i]!
      return [t, r.status === 'fulfilled' ? r.value : []]
    }))
  }

  return { fetchProperties, fetchProperty, updateProperty, deleteProperty, moderateProperty, moderateUnit, loadRefs }
}
