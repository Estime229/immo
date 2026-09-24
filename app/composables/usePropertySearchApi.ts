import type { AvailabilityBlock, OwnerStorefront, PointOfInterest, PropertySearchFilters, PropertySearchPage, PropertySearchResult, UnitPricing } from '~/types/property'

/**
 * Recherche et fiche logement publiques — voir 11-INTEGRATION-AUTH-ET-PUBLIC.md, I4.
 * `GET /property/search` et `GET /property/{id}` (pas `/public/properties/{id}`,
 * qui ne renvoie qu'un résumé allégé pour le partage WhatsApp/Facebook — vérifié
 * en direct le 2026-09-19) sont les vraies sources d'une recherche/fiche complète,
 * et sont publiques malgré leur préfixe `/property` (aucun jeton requis, confirmé
 * en direct — le Swagger ne déclare simplement pas de `security` sur ces routes).
 */
export function usePropertySearchApi() {
  const pub = usePublicApi()

  async function search(filters: PropertySearchFilters) {
    return pub.get<PropertySearchPage>('/property/search', filters as Record<string, unknown>)
  }

  async function fetchById(id: string) {
    return pub.get<PropertySearchResult>(`/property/${id}`)
  }

  async function fetchAvailability(unitId: string) {
    return pub.get<AvailabilityBlock[]>(`/units/${unitId}/availability`)
  }

  async function fetchPricing(unitId: string) {
    return pub.get<UnitPricing[]>(`/units/${unitId}/pricing`)
  }

  /** `q` est déclaré requis par le Swagger mais une chaîne vide fonctionne (vérifié en direct) — ne filtre alors sur rien. */
  async function fetchOwnerStorefront(ownerId: string, filters: PropertySearchFilters = {}) {
    return pub.get<OwnerStorefront>(`/public/owners/${ownerId}`, { q: '', ...filters })
  }

  /** Points d'intérêt signalés autour du bien (mosquée, bar, école, bruit…) — `/properties/:id/pois`, public, vérifié en direct. */
  async function fetchPois(propertyId: string) {
    return pub.get<PointOfInterest[]>(`/properties/${propertyId}/pois`)
  }

  return { search, fetchById, fetchAvailability, fetchPricing, fetchOwnerStorefront, fetchPois }
}
