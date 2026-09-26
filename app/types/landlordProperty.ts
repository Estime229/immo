/**
 * Payloads d'écriture pour la gestion des biens (IP2) — voir
 * 13-INTEGRATION-PRO-ET-ARTISAN.md. La lecture réutilise les types déjà
 * écrits pour I4 (`PropertySearchResult`/`UnitSearchResult`, ~/types/property) :
 * `GET /property/owner/me` et `GET /property/{id}` renvoient la même forme
 * que la recherche publique.
 */

export interface CreatePropertyPayload {
  name: string
  building_type: string
  city_id: string
  address?: string
  neighborhood_id?: string
  status?: 'available' | 'occupied' | 'maintenance'
  description?: Record<string, string>
  /** Vitrine publique du propriétaire uniquement — n'a aucun effet sur la recherche (vérifié en live). Défaut API : false. */
  is_publicly_listed?: boolean
  gps_latitude?: number
  gps_longitude?: number
  characteristics?: Record<string, unknown>
}

/**
 * Vérifié en live (Lot 45) : type, ville, quartier, adresse, GPS, caractéristiques
 * et visibilité vitrine sont tous modifiables après création — contrairement à ce
 * qu'affirmait la fiche depuis le Lot 21. `images` remplace toute la liste des photos.
 */
export interface UpdatePropertyPayload {
  name?: string
  status?: string
  description?: Record<string, string>
  building_type?: string
  city_id?: string
  neighborhood_id?: string | null
  address?: string
  characteristics?: Record<string, unknown>
  is_publicly_listed?: boolean
  images?: { url: string; rank: number; is_primary: boolean }[]
}

export interface CreateUnitPayload {
  ref_type_id: string
  name: string
  price: number
  description?: Record<string, string>
  unit_status?: 'available' | 'occupied' | 'notice_given'
  /** Obligatoire si unit_status = 'notice_given' (ISO date) — vérifié sur CreateUnitCommand. */
  available_from?: string
  bedrooms_count?: number
  bathrooms_count?: number
  surface_m2?: number
  floor?: number
  caution_months?: number
  avance_months?: number
  prepaye_months?: number
  frais_dossier?: number
  toilet_type?: string
  water_source?: string
  meter_type?: string
  furnished_level?: string
  characteristics?: Record<string, unknown>
  /** Codes `GET /ref?type=FEATURE` (clim, wifi…) — enregistrés, mais non renvoyés par la fiche publique (limite backend, Lot 45). */
  features?: string[]
  /** 1 = à la nuit possible, 30 = au mois uniquement. */
  min_duration_days?: number
  max_duration_days?: number
  is_publicly_listed?: boolean
  /** Exige un état des lieux pour toute réservation courte durée — défaut false, jamais imposé par la plateforme. */
  requires_booking_inventory?: boolean
  /** Séquestre optionnel (0-100) sur les réservations courte durée — défaut 0 = tout crédité immédiatement. */
  booking_retention_percentage?: number
}

export type UpdateUnitPayload = Partial<CreateUnitPayload>

export interface UploadImageResult {
  url: string
  thumbnail_url: string
}

export interface MediaItem {
  id: string
  property_id: string
  url: string
  type: 'image' | 'video_360' | 'video_short'
  rank: number
  is_primary: boolean
}

export interface PointOfInterest {
  id: string
  poi_type: string
  name: string | null
  distance_meters: number | null
  noise_level: string | null
  is_verified: boolean | null
}

export interface CreatePoiPayload {
  poi_type: string
  name?: string
  distance_meters?: number
  noise_level?: string
}
