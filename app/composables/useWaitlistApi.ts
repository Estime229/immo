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

  return { fetchMine, fetchForUnit }
}
