import type { RentalRequestSummary } from '~/types/tenant'

/**
 * Candidatures (`/rental/requests`). Postuler exige une identité vérifiée
 * (403 `error.KYC_REQUIRED`). Accepter crée le brouillon de bail, marque le
 * logement occupé et refuse les autres candidatures en attente ; ni refus ni
 * nouvelle candidature ne notifient personne (Lot 51, #66).
 */
export function useRentalRequestsApi() {
  const api = useApi()

  async function fetchMine(side: 'tenant' | 'landlord' = 'tenant') {
    return api.get<RentalRequestSummary[]>('/rental/requests', { for: side })
  }

  async function create(payload: { unit_id: string; message?: string; desired_move_in_at?: string }) {
    return api.post<RentalRequestSummary>('/rental/requests', payload)
  }

  async function accept(id: string) {
    return api.patch<RentalRequestSummary>(`/rental/requests/${id}/accept`)
  }

  async function reject(id: string) {
    return api.patch<RentalRequestSummary>(`/rental/requests/${id}/reject`)
  }

  return { fetchMine, create, accept, reject }
}
