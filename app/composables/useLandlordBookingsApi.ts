import type { LandlordBookingSummary } from '~/types/landlordBookings'

/** Réservations courte durée reçues — voir 13-INTEGRATION-PRO-ET-ARTISAN.md, IP6. Lecture seule : aucune action propriétaire (confirmer/annuler) n'existe côté API pour ce flux. */
export function useLandlordBookingsApi() {
  const api = useApi()

  async function fetchMine() {
    return api.get<LandlordBookingSummary[]>('/bookings/landlord')
  }

  return { fetchMine }
}
