import type { WaitlistEntry } from '~/types/tenant'
import type { LandlordWaitlistEntry } from '~/types/property'

export function useWaitlistApi() {
  const api = useApi()

  async function fetchMine() {
    return api.get<WaitlistEntry[]>('/units/waitlist/mine')
  }

  /** Côté propriétaire — voir 13-INTEGRATION-PRO-ET-ARTISAN.md, IP-tarifs. Forme de réponse non documentée par le Swagger, déduite par analogie (voir LandlordWaitlistEntry). */
  async function fetchForUnit(unitId: string) {
    return api.get<LandlordWaitlistEntry[]>(`/units/${unitId}/waitlist`)
  }

  /** Le propriétaire peut retirer une inscription (`leave` autorise l'intéressé, le propriétaire ou un admin — vérifié en live, 204). */
  async function removeEntry(unitId: string, tenantId: string) {
    return api.delete<unknown>(`/units/${unitId}/waitlist/${tenantId}`)
  }

  return { fetchMine, fetchForUnit, removeEntry }
}
