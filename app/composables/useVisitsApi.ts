import type { VisitSummary } from '~/types/tenant'
import { ApiRequestError } from '~/utils/authenticatedFetcher'
import { EXPECTED_STATUS } from '~/utils/visits'

/**
 * Module visites — voir 12-INTEGRATION-LOCATAIRE.md, IL6, et
 * 13-INTEGRATION-PRO-ET-ARTISAN.md, IP5 pour les actions propriétaire.
 */
export function useVisitsApi() {
  const api = useApi()

  /**
   * `role` toujours envoyé : sans lui, l'API prend le rôle actif du compte
   * (constaté en live — un propriétaire reçoit alors ses visites de
   * propriétaire), pas « locataire par défaut » comme on le supposait.
   */
  async function fetchMine(role: 'tenant' | 'landlord' = 'tenant') {
    return api.get<VisitSummary[]>('/visits', { role })
  }

  async function fetchOne(id: string) {
    return api.get<VisitSummary>(`/visits/${id}`)
  }

  /**
   * Création, confirmation, refus et annulation renvoient **500 alors que
   * l'action a bien eu lieu** (vérifié en live, Lot 48 : l'API envoie un
   * email après l'enregistrement, et l'envoi d'email échoue en production).
   * Sur un 500 on relit donc l'état réel avant de conclure à un échec —
   * sinon l'utilisateur réessaie et tombe sur « déjà une visite en attente ».
   */
  function isServerError(e: unknown) {
    return e instanceof ApiRequestError && (e.status ?? 0) >= 500
  }
  async function act(id: string, action: keyof typeof EXPECTED_STATUS, run: () => Promise<VisitSummary>) {
    try {
      return await run()
    } catch (e) {
      if (!isServerError(e)) throw e
      const actual = await fetchOne(id).catch(() => null)
      if (actual && actual.status === EXPECTED_STATUS[action]) return actual
      throw e
    }
  }

  /**
   * `requestedAt` en ISO, dans le futur. 400 « déjà une visite en attente »
   * seulement si une visite `pending` existe pour ce logement (code relu au
   * Lot 48 — `visit.service.ts` ne filtre que ce statut).
   */
  async function create(unitId: string, requestedAt: string, note?: string) {
    try {
      return await api.post<VisitSummary>('/visits', { unit_id: unitId, requested_at: requestedAt, ...(note ? { note } : {}) })
    } catch (e) {
      if (!isServerError(e)) throw e
      const mine = await fetchMine('tenant').catch(() => [] as VisitSummary[])
      const saved = mine.find(v => v.unit_id === unitId && v.status === 'pending' && new Date(v.requested_at).getTime() === new Date(requestedAt).getTime())
      if (saved) return saved
      throw e
    }
  }

  async function cancel(id: string) {
    return act(id, 'cancel', () => api.patch<VisitSummary>(`/visits/${id}/cancel`))
  }

  /** `confirmedAt` optionnel — si absent, le serveur garde la date demandée par le locataire. */
  async function confirm(id: string, confirmedAt?: string) {
    return act(id, 'confirm', () => api.patch<VisitSummary>(`/visits/${id}/confirm`, confirmedAt ? { confirmed_at: confirmedAt } : {}))
  }

  async function reject(id: string, reason?: string) {
    return act(id, 'reject', () => api.patch<VisitSummary>(`/visits/${id}/reject`, reason ? { reason } : {}))
  }

  async function complete(id: string) {
    return act(id, 'complete', () => api.patch<VisitSummary>(`/visits/${id}/complete`))
  }

  async function reschedule(id: string, confirmedAt: string) {
    return act(id, 'reschedule', () => api.patch<VisitSummary>(`/visits/${id}/reschedule`, { confirmed_at: confirmedAt }))
  }

  return { fetchMine, fetchOne, create, cancel, confirm, reject, complete, reschedule }
}
