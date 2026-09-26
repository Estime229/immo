/**
 * Types pour la recherche et la fiche logement publiques — I4. Écrits à
 * partir des réponses réelles de `GET /property/search` et `GET /property/{id}`
 * (vérifiées en direct le 2026-09-19, bien plus riches que les exemples
 * Swagger abrégés). Montants en chaînes — ne convertir qu'à l'affichage.
 */

export type UnitStatus = 'available' | 'occupied' | 'notice_given' | 'maintenance' | 'coming_soon'

export interface UnitMedia {
  id: string
  url: string
  type: string
  rank: number
  is_primary: boolean
}

export interface PropertyMedia {
  id: string
  url: string
  type: string
  rank?: number
  is_primary?: boolean
}

/** `description` est soit `null`, soit multilingue ({ fr, en, ... }) — jamais du texte brut. */
export type LocalizedText = Record<string, string> | null

export interface UnitSearchResult {
  id: string
  property_id: string
  name: string
  price: string
  toilet_type: string | null
  water_source: string | null
  meter_type: string | null
  furnished_level: string | null
  min_duration_days: number | null
  max_duration_days: number | null
  unit_status: UnitStatus
  available_from: string | null
  surface_m2: number | null
  floor: number | null
  bedrooms_count: number
  bathrooms_count: number
  description: LocalizedText
  unit_media: UnitMedia[]
  /** Présent uniquement sur les unités "standalone" (sans bien parent) renvoyées par /property/search. */
  _virtual?: boolean
  city?: { id: string; name: string }
  /** Absents du type d'origine (écrit pour la recherche publique) mais bien présents en direct sur `GET /property/owner/me` — nécessaires pour préremplir un formulaire d'édition d'unité. */
  ref_type_id?: string
  caution_months?: number | null
  avance_months?: number | null
  prepaye_months?: number | null
  frais_dossier?: number | string | null
  is_publicly_listed?: boolean
  requires_booking_inventory?: boolean
  booking_retention_percentage?: number
  characteristics?: Record<string, unknown> | null
  /** Équipements (`GET /ref?type=FEATURE`) — renvoyés seulement par `GET /property/owner/me`, jamais par la fiche publique (Lot 45). */
  resolved_features?: { code: string }[]
}

export interface PropertySearchResult {
  id: string
  owner_id: string
  name: string
  building_type: string
  address: string | null
  neighborhood_id: string | null
  city_id: string | null
  gps_latitude: string | null
  gps_longitude: string | null
  description: LocalizedText
  status: string
  is_publicly_listed: boolean
  /** `PROPERTY_CHARS` (is_fenced, has_guardian, has_parking, has_garden, has_water_tank) — les autres clés sont ignorées par l'API. */
  characteristics?: Record<string, unknown> | null
  media: PropertyMedia[]
  units: UnitSearchResult[]
  city?: { id: string; name: string }
  neighborhood?: { id: string; name: string }
  owner?: { id: string; first_name: string | null; last_name: string | null; avatar_url: string | null }
}

export interface PropertySearchPage {
  data: (PropertySearchResult | UnitSearchResult)[]
  total: number
  page: number
  limit: number
  totalPages: number
}

export interface PropertySearchFilters {
  q?: string
  city?: string
  neighborhood_id?: string
  min_price?: number
  max_price?: number
  building_type?: string
  unit_type_id?: string
  min_bedrooms?: number
  water_source?: string
  meter_type?: string
  sort?: 'newest' | 'oldest' | 'price_asc' | 'price_desc'
  page?: number
  limit?: number
}

/** Réponse de GET /reviews/property/:id — jamais 404, tableau vide si aucun avis. */
export interface ReviewItem {
  id: string
  rating: number
  comment: string | null
  created_at: string
  reviewer: { id: string; first_name: string | null; last_name: string | null; avatar_url: string | null }
}

/** `average` à 0 si aucun avis — jamais null. */
export interface ReviewStats {
  average: number
  count: number
  distribution: Record<string, number>
}

/**
 * `end_date` est réellement `null` sur un blocage sans terme (un bail actif
 * sans date de fin bloque `blocked_by: 'lease'` indéfiniment) — vérifié en
 * direct (Lot 32), même piège que `LeaseSummary.end_date` (Lot 23). La liste
 * ne renvoie pas d'`id` (même pour un blocage `manual`) — seule la réponse
 * de création en a un, voir `AvailabilityBlockDetail`.
 */
export interface AvailabilityBlock {
  start_date: string
  end_date: string | null
  blocked_by: string
}

/** Réponse de POST /units/:id/availability-blocks — seule forme qui porte un `id`, nécessaire pour DELETE. */
export interface AvailabilityBlockDetail extends AvailabilityBlock {
  id: string
  unit_id: string
  reference_id: string | null
  note: string | null
  created_at: string
}

/** `GET /properties/:id/pois` — signalés par des locataires, `verified` seulement après relecture admin. */
export interface PointOfInterest {
  id: string
  property_id: string
  poi_type: string
  name: string
  distance_meters: number | null
  noise_level: string | null
  hours: string | null
  gps_latitude: number | null
  gps_longitude: number | null
  reported_by: string
  verified: boolean
  created_at: string
}

export interface UnitPricing {
  id: string
  unit_id: string
  billing_frequency: string
  price: string
  is_available: boolean
  min_periods: number
  created_at?: string
  updated_at?: string
}

export type BillingFrequency = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'semi_annual' | 'annual'

export interface CreatePricingPayload {
  billing_frequency: BillingFrequency
  price: number
  min_periods?: number
}

export interface UpdatePricingPayload {
  price?: number
  is_available?: boolean
  min_periods?: number
}

export interface BlockAvailabilityPayload {
  start_date: string
  end_date: string
  note?: string
}

/**
 * Forme côté propriétaire non documentée par le Swagger (`GET /units/:unitId/waitlist`
 * n'a ni schéma ni exemple) — déduite par analogie avec `WaitlistEntry`
 * (Lot 7, vue locataire) : mêmes champs, `tenant` au lieu de `unit` puisque
 * la portée est déjà l'unité. Non vérifiée en direct faute d'inscription
 * réelle disponible (Lot 32) — à corriger dès qu'une vraie donnée existe.
 */
export interface LandlordWaitlistEntry {
  id: string
  unit_id: string
  message: string
  notified_at: string | null
  created_at: string
  tenant: { id: string; first_name: string | null; last_name: string | null }
}

/** Réponse de GET /public/owners/:userId — la vitrine publique d'un propriétaire/agence. */
export interface OwnerProfile {
  id: string
  display_name: string
  avatar_url: string | null
  bio: string | null
  is_verified: boolean
  role: string
  member_since: string
  kyb_status: string | null
}

export interface OwnerStorefront {
  profile: OwnerProfile
  /** Uniquement les biens dont `is_publicly_listed` est vrai au niveau du bien lui-même, pas seulement de l'unité — vérifié en direct. */
  properties: PropertySearchPage
}
