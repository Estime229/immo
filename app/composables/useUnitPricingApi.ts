import type { AvailabilityBlock, AvailabilityBlockDetail, BlockAvailabilityPayload, CreatePricingPayload, UnitPricing, UpdatePricingPayload } from '~/types/property'

/** Tarifs, calendrier de disponibilité et blocages manuels par unité — voir 13-INTEGRATION-PRO-ET-ARTISAN.md, IP-tarifs. */
export function useUnitPricingApi() {
  const api = useApi()

  async function fetchPricing(unitId: string) {
    return api.get<UnitPricing[]>(`/units/${unitId}/pricing`)
  }

  async function createPricing(unitId: string, payload: CreatePricingPayload) {
    return api.post<UnitPricing>(`/units/${unitId}/pricing`, payload)
  }

  async function updatePricing(unitId: string, pricingId: string, payload: UpdatePricingPayload) {
    return api.patch<UnitPricing>(`/units/${unitId}/pricing/${pricingId}`, payload)
  }

  async function removePricing(unitId: string, pricingId: string) {
    return api.delete<{ success: boolean }>(`/units/${unitId}/pricing/${pricingId}`)
  }

  /** Public — plages bloquées par un bail, une réservation confirmée, ou un blocage manuel. Pas d'`id` sur les entrées liées à un bail/réservation (voir AvailabilityBlock). */
  async function fetchAvailability(unitId: string) {
    return api.get<AvailabilityBlock[]>(`/units/${unitId}/availability`)
  }

  /** Réservé au propriétaire — un bail ou une réservation payée bloquent automatiquement, sans passer par ici. 409 si la période chevauche un blocage existant. */
  async function blockAvailability(unitId: string, payload: BlockAvailabilityPayload) {
    return api.post<AvailabilityBlockDetail>(`/units/${unitId}/availability-blocks`, payload)
  }

  /** Uniquement pour un blocage `manual` — un blocage lié à un bail/réservation ne peut pas être retiré ici. */
  async function unblockAvailability(unitId: string, blockId: string) {
    return api.delete<{ success: boolean }>(`/units/${unitId}/availability-blocks/${blockId}`)
  }

  return { fetchPricing, createPricing, updatePricing, removePricing, fetchAvailability, blockAvailability, unblockAvailability }
}
