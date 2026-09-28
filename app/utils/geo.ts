/**
 * Coordonnées des biens pour les cartes publiques.
 *
 * `gps_latitude` / `gps_longitude` sont saisis à la main par les propriétaires
 * et arrivent en chaîne (recherche) ou en nombre (fiche). Vérifié en direct le
 * 2026-09-27 : seuls 8 biens sur 38 en ont, et l'un d'eux (« Studio LAPERTA »,
 * Parakou) pointe en plein golfe de Guinée (1.00, 2.09). On ne place donc un
 * repère précis que si le point tombe au Bénin ; sinon on retombe sur le centre
 * de la ville, affiché comme zone approximative, jamais comme adresse exacte.
 */

export type GeoPoint = { lat: number; lng: number }
export type ResolvedLocation = GeoPoint & { precise: boolean }

/** Repère affiché par `<MapView>` : `precise: false` = zone approximative (cercle en pointillés). */
export type MapMarker = ResolvedLocation & {
  id: string
  label: string
  /** Étiquette courte affichée quand la carte est dézoomée (repères serrés), ex. le seul nombre de logements. */
  shortLabel?: string
  /** Nombre de logements représentés (une zone en regroupe plusieurs) — sert au cadrage. */
  weight?: number
}

/**
 * Tuiles OpenStreetMap standard : gratuites, sans clé, attribution obligatoire.
 * (CARTO exige désormais une clé API — vérifié le 2026-09-27.) À fort trafic,
 * la politique d'usage d'OSM demande de passer à un fournisseur dédié.
 */
export const MAP_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
export const MAP_TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'

/** Centre par défaut des cartes (Cotonou). */
export const DEFAULT_MAP_CENTER: GeoPoint = { lat: 6.3654, lng: 2.4183 }

/** Emprise du Bénin, avec une petite marge. */
const BENIN_BOUNDS = { minLat: 6.0, maxLat: 12.5, minLng: 0.7, maxLng: 3.9 }

/** Centres-villes approximatifs — utilisés uniquement pour une zone, jamais pour un repère précis. */
const CITY_CENTERS: Record<string, GeoPoint> = {
  'cotonou': { lat: 6.3654, lng: 2.4183 },
  'abomey-calavi': { lat: 6.4485, lng: 2.3557 },
  'porto-novo': { lat: 6.4969, lng: 2.6289 },
  'seme-podji': { lat: 6.3833, lng: 2.6167 },
  'ouidah': { lat: 6.3631, lng: 2.0851 },
  'parakou': { lat: 9.3372, lng: 2.6303 },
  'bohicon': { lat: 7.1782, lng: 2.0667 },
  'abomey': { lat: 7.1829, lng: 1.9912 },
  'lokossa': { lat: 6.6387, lng: 1.7167 },
  'natitingou': { lat: 10.3042, lng: 1.3796 },
  'djougou': { lat: 9.7085, lng: 1.666 },
  'kandi': { lat: 11.1342, lng: 2.9386 }
}

function normalizeCity(name: string) {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().replace(/\s+/g, '-')
}

export function toCoordinate(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export function isInBenin(lat: number, lng: number) {
  return lat >= BENIN_BOUNDS.minLat && lat <= BENIN_BOUNDS.maxLat && lng >= BENIN_BOUNDS.minLng && lng <= BENIN_BOUNDS.maxLng
}

/** Point GPS exploitable, ou `null` s'il est absent ou hors du Bénin. */
export function preciseLocation(lat: string | number | null | undefined, lng: string | number | null | undefined): GeoPoint | null {
  const la = toCoordinate(lat)
  const ln = toCoordinate(lng)
  if (la === null || ln === null || !isInBenin(la, ln)) return null
  return { lat: la, lng: ln }
}

/** « 6.36320, 2.41850 » — 5 décimales ≈ 1 m, largement assez pour situer un bâtiment. */
export function formatCoords(p: GeoPoint) {
  return `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`
}

/** Arrondi à 5 décimales avant envoi, pour ne pas stocker une précision illusoire. */
export function roundCoords(p: GeoPoint): GeoPoint {
  return { lat: Math.round(p.lat * 1e5) / 1e5, lng: Math.round(p.lng * 1e5) / 1e5 }
}

export function cityCenter(cityName: string | null | undefined): GeoPoint | null {
  if (!cityName) return null
  return CITY_CENTERS[normalizeCity(cityName)] ?? null
}

/** Position à afficher : le GPS s'il est valable, sinon le centre de la ville (approximatif), sinon rien. */
export function resolveLocation(p: { gps_latitude?: string | number | null; gps_longitude?: string | number | null; city?: { name: string } | null }): ResolvedLocation | null {
  const exact = preciseLocation(p.gps_latitude, p.gps_longitude)
  if (exact) return { ...exact, precise: true }
  const center = cityCenter(p.city?.name)
  return center ? { ...center, precise: false } : null
}

/** Distance approximative en km (équirectangulaire — largement suffisant à l'échelle d'un pays). */
export function distanceKm(a: GeoPoint, b: GeoPoint) {
  const rad = Math.PI / 180
  const x = (b.lng - a.lng) * rad * Math.cos(((a.lat + b.lat) / 2) * rad)
  const y = (b.lat - a.lat) * rad
  return Math.sqrt(x * x + y * y) * 6371
}

/**
 * Repères à cadrer : ceux du secteur qui concentre le plus de logements
 * (dans un rayon de `radiusKm`). Un bien isolé à l'autre bout du pays ne doit
 * pas forcer une vue nationale où tout Cotonou tient en un point ; il reste
 * visible en dézoomant.
 */
export function focusCluster<T extends GeoPoint & { weight?: number }>(points: T[], radiusKm = 60): T[] {
  if (points.length <= 1) return points
  let best: T[] = points
  let bestWeight = -1
  for (const anchor of points) {
    const near = points.filter(p => distanceKm(anchor, p) <= radiusKm)
    const w = near.reduce((sum, p) => sum + (p.weight ?? 1), 0)
    if (w > bestWeight) {
      best = near
      bestWeight = w
    }
  }
  return best
}
