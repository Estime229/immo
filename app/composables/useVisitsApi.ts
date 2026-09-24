import type { VisitSummary } from '~/types/tenant'

/**
 * Module visites — voir 12-INTEGRATION-LOCATAIRE.md, IL6, et
 * 13-INTEGRATION-PRO-ET-ARTISAN.md, IP5 pour les actions propriétaire.
 */
export function useVisitsApi() {
  const api = useApi()

  /** Sans `role`, l'API renvoie le contexte locataire par défaut — `role: 'landlord'` bascule sur les visites des biens du propriétaire connecté. */
  async function fetchMine(role: 'tenant' | 'landlord' = 'tenant') {
    return api.get<VisitSummary[]>('/visits', role === 'landlord' ? { role } : undefined)
  }

  /**
   * `requestedAt` en ISO, doit être dans le futur (contrainte serveur) — 400
   * « Vous avez deja une visite en attente pour ce logement » si une visite
   * existe déjà pour ce couple locataire/unité. Vérifié en direct (Lot 22) :
   * ce blocage survit même après que la visite précédente soit passée à
   * `completed`, donc pas un simple filtre sur `status: 'pending'` — plutôt
   * une limite à une visite par locataire et par unité, tous statuts confondus
   * à l'exception (probable, non confirmée) de `cancelled`/`rejected`.
   */
  async function create(unitId: string, requestedAt: string, note?: string) {
    return api.post<VisitSummary>('/visits', { unit_id: unitId, requested_at: requestedAt, ...(note ? { note } : {}) })
  }

  async function cancel(id: string) {
    return api.patch<VisitSummary>(`/visits/${id}/cancel`)
  }

  /** `confirmedAt` optionnel — si absent, le serveur garde la date demandée par le locataire. */
  async function confirm(id: string, confirmedAt?: string) {
    return api.patch<VisitSummary>(`/visits/${id}/confirm`, confirmedAt ? { confirmed_at: confirmedAt } : {})
  }

  async function reject(id: string, reason?: string) {
    return api.patch<VisitSummary>(`/visits/${id}/reject`, reason ? { reason } : {})
  }

  async function complete(id: string) {
    return api.patch<VisitSummary>(`/visits/${id}/complete`)
  }

  async function reschedule(id: string, confirmedAt: string) {
    return api.patch<VisitSummary>(`/visits/${id}/reschedule`, { confirmed_at: confirmedAt })
  }

  return { fetchMine, create, cancel, confirm, reject, complete, reschedule }
}
