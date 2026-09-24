import type {
  AdvanceBufferStatus,
  AutoDebitResult,
  BufferTopUpResult,
  CreateLeasePayload,
  CreateLeaseResult,
  EntryPaymentResult,
  LeaseActionResult,
  LeaseSignResult,
  LeaseSummary,
  NoticeResult,
  PrepaidBufferStatus
} from '~/types/tenant'

/**
 * Module baux — voir 12-INTEGRATION-LOCATAIRE.md, IL2 (côté locataire) et
 * 13-INTEGRATION-PRO-ET-ARTISAN.md, IP-baux (création et cycle de vie côté
 * propriétaire, Lot 23). Le PDF (contrat, quittance) passe par usePdfDocument(), pas par ici.
 */
export function useLeasesApi() {
  const api = useApi()

  /** Par utilisateur, pas par bien — même schéma que /visits, /signals : renvoie les baux du propriétaire quand appelé par un compte landlord (vérifié en direct, Lot 23). */
  async function fetchMine() {
    return api.get<LeaseSummary[]>('/leases/my')
  }

  /** Double signature (locataire + propriétaire) : passe le bail à 'signed', PAS 'active'. */
  async function sign(id: string) {
    return api.patch<LeaseSignResult>(`/leases/${id}/sign`)
  }

  /** Débite le wallet du locataire (caution + avance + prépayé) — seul ce qui rend le bail 'active'. */
  async function payEntry(id: string) {
    return api.post<EntryPaymentResult>(`/leases/${id}/entry-payment`)
  }

  async function setAutoDebit(id: string, enabled: boolean) {
    return api.patch<AutoDebitResult>(`/leases/${id}/auto-debit`, { enabled })
  }

  /** Déclaratif — ne déclenche rien côté serveur au-delà de poser la date de départ prévue. */
  async function giveNotice(id: string) {
    return api.post<NoticeResult>(`/leases/${id}/give-notice`)
  }

  async function cancelNotice(id: string) {
    return api.post<NoticeResult>(`/leases/${id}/cancel-notice`)
  }

  async function fetchAdvanceBuffer(id: string) {
    return api.get<AdvanceBufferStatus>(`/leases/${id}/advance-buffer`)
  }

  async function fetchPrepaidBuffer(id: string) {
    return api.get<PrepaidBufferStatus>(`/leases/${id}/prepaid-buffer`)
  }

  /** Plafonné à advance_target côté serveur — refus explicite si dépassement, jamais de troncature silencieuse. */
  async function topUpAdvanceBuffer(id: string, amount: number) {
    return api.post<BufferTopUpResult>(`/leases/${id}/advance-buffer/top-up`, { amount })
  }

  async function topUpPrepaidBuffer(id: string, amount: number) {
    return api.post<BufferTopUpResult>(`/leases/${id}/prepaid-buffer/top-up`, { amount })
  }

  /** Réservé aux rôles admin/landlord/agent. `monthlyRent` peut être omis si `unitId` porte un tarif `unit_pricing` actif pour `billingFrequency` — sinon 400. */
  async function create(payload: CreateLeasePayload) {
    return api.post<CreateLeaseResult>('/leases', payload)
  }

  /** DRAFT → PENDING_SIGNATURE, signe aussi côté propriétaire — 403 si le bail n'est pas en brouillon. */
  async function send(id: string) {
    return api.patch<LeaseActionResult>(`/leases/${id}/send`)
  }

  /** Réservé au propriétaire — seulement si SIGNED et délai de grâce de 72h dépassé sans paiement d'entrée, jamais automatique. */
  async function cancelUnpaid(id: string) {
    return api.patch<LeaseActionResult>(`/leases/${id}/cancel-unpaid`)
  }

  /** Résilie un bail ACTIVE — locataire, propriétaire, ou membre d'équipe autorisé. */
  async function terminate(id: string) {
    return api.patch<LeaseActionResult>(`/leases/${id}/terminate`)
  }

  return {
    fetchMine,
    sign,
    payEntry,
    setAutoDebit,
    giveNotice,
    cancelNotice,
    fetchAdvanceBuffer,
    fetchPrepaidBuffer,
    topUpAdvanceBuffer,
    topUpPrepaidBuffer,
    create,
    send,
    cancelUnpaid,
    terminate
  }
}
