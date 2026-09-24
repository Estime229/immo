import type { City, Neighborhood, RefEntry } from '~/types/reference'

/**
 * Référentiels publics (villes, quartiers, codes eau/compteur/meublé/type de
 * logement) — statiques le temps d'une session, mis en cache au niveau module
 * pour ne jamais les refetcher deux fois. Voir 10-SOCLE-INTEGRATION.md.
 * Tous les endpoints sous-jacents sont publics (vérifié en direct, sans jeton).
 */
const cache = new Map<string, Promise<unknown>>()

function cached<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  if (!cache.has(key)) cache.set(key, fetcher())
  return cache.get(key) as Promise<T>
}

export function useReferenceData() {
  const pub = usePublicApi()

  function fetchCities() {
    return cached('cities', () => pub.get<City[]>('/location/cities'))
  }

  function fetchNeighborhoods(cityId?: string) {
    return cached(`neighborhoods:${cityId ?? 'all'}`, () => pub.get<Neighborhood[]>('/location/neighborhoods', cityId ? { city_id: cityId } : undefined))
  }

  /** `type` : WATER_SOURCE, METER_TYPE, FURNISHED_LEVEL, UNIT_TYPE, PROPERTY_TYPE, TOILET_TYPE… */
  function fetchRef(type: string) {
    return cached(`ref:${type}`, () => pub.get<RefEntry[]>('/ref', { type }))
  }

  return { fetchCities, fetchNeighborhoods, fetchRef }
}

/** `labels.fr`, repli sur le code brut si le référentiel n'a pas (encore) chargé — jamais un objet affiché. */
export function labelFor(entries: RefEntry[], code: string | null): string {
  if (!code) return ''
  return entries.find(e => e.code === code)?.labels.fr ?? code
}
