import type { LandlordStats } from '~/types/landlord'

/**
 * Statistiques propriétaire — voir 13-INTEGRATION-PRO-ET-ARTISAN.md, IP1.
 * `GET /property/landlord/stats/advanced` répond 500 sur un compte sans
 * aucun bien (vérifié en direct) — jamais la source unique. On tente
 * `advanced` (plus riche : comparaison, top biens, note moyenne) et on
 * retombe sur `/stats` (toujours fiable, y compris à vide) en cas d'échec.
 */
export function useLandlordStatsApi() {
  const api = useApi()

  async function fetchStats(): Promise<LandlordStats> {
    try {
      return await api.get<LandlordStats>('/property/landlord/stats/advanced')
    } catch {
      return await api.get<LandlordStats>('/property/landlord/stats')
    }
  }

  return { fetchStats }
}
