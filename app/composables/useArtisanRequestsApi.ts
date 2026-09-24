import type {
  ArtisanOffer,
  ArtisanPartnership,
  ArtisanPayResult,
  ArtisanRequestSummary,
  ArtisanReview,
  ArtisanSearchPage,
  CreateArtisanRequestPayload
} from '~/types/artisan'

/**
 * Demandes d'intervention artisan, offres, paiement, avis, partenariats —
 * voir 13-INTEGRATION-PRO-ET-ARTISAN.md, sous-système découvert au Lot 20.
 * `GET /artisan-requests/my` renvoie automatiquement les demandes du rôle de
 * l'appelant (propriétaire OU artisan), même motif que `/leases/my`, `/visits`,
 * `/signals` — jamais de paramètre de rôle à passer.
 */
export function useArtisanRequestsApi() {
  const api = useApi()

  async function create(payload: CreateArtisanRequestPayload) {
    return api.post<ArtisanRequestSummary>('/artisan-requests', payload)
  }

  async function listMine() {
    return api.get<ArtisanRequestSummary[]>('/artisan-requests/my')
  }

  /** Postes publics ouverts à candidature — réservé aux comptes artisan (403 sinon). */
  async function listOpen(tradeReferenceId?: string, page = 1, limit = 20) {
    return api.get<{ data: ArtisanRequestSummary[]; total: number }>('/artisan-requests/open', { trade: tradeReferenceId, page, limit })
  }

  /** Candidature sur un poste public (créé sans `target_artisan_id`) — crée sa propre ligne, sa propre conversation. */
  async function applyToOpen(id: string, message?: string) {
    return api.post<ArtisanRequestSummary>(`/artisan-requests/${id}/apply`, { message })
  }

  async function cancel(id: string) {
    return api.patch<ArtisanRequestSummary>(`/artisan-requests/${id}/cancel`)
  }

  /** Paie l'offre acceptée — le solde débité est celui du wallet de l'appelant, voir IP3/IL4. */
  async function pay(id: string) {
    return api.patch<ArtisanPayResult>(`/artisan-requests/${id}/pay`)
  }

  async function complete(id: string) {
    return api.patch<ArtisanRequestSummary>(`/artisan-requests/${id}/complete`)
  }

  async function review(id: string, rating: number, comment?: string) {
    return api.post<ArtisanReview>(`/artisan-requests/${id}/review`, { rating, comment })
  }

  async function listOffers(id: string) {
    return api.get<ArtisanOffer[]>(`/artisan-requests/${id}/offers`)
  }

  /** Côté artisan — proposer un prix/garantie/retenue sur une demande dont on fait déjà partie (cible directe, ou candidature créée par `applyToOpen`). */
  async function submitOffer(id: string, payload: { price: number; warranty_days: number; retention_percentage: number }) {
    return api.post<ArtisanOffer>(`/artisan-requests/${id}/offers`, payload)
  }

  async function respondOffer(offerId: string, action: 'accept' | 'reject') {
    return api.patch<ArtisanOffer>(`/artisan-requests/offers/${offerId}/respond`, { action })
  }

  /** `trade` (UUID de référence ARTISAN_TRADE) est requis par l'API — pas de recherche sans métier choisi. */
  async function searchArtisans(tradeReferenceId: string, page = 1, limit = 20) {
    return api.get<ArtisanSearchPage>('/artisans', { trade: tradeReferenceId, page, limit })
  }

  async function createPartnership(artisanId: string) {
    return api.post<ArtisanPartnership>('/artisan-partnerships', { artisan_id: artisanId })
  }

  async function myPartnerships() {
    return api.get<ArtisanPartnership[]>('/artisan-partnerships/mine')
  }

  async function endPartnership(id: string) {
    return api.patch<ArtisanPartnership>(`/artisan-partnerships/${id}/end`)
  }

  /** Côté artisan — accepter ou refuser une invitation reçue. `decline`, pas `reject` — différent de `offers/respond` (vérifié sur le schéma Swagger). */
  async function respondPartnership(id: string, action: 'accept' | 'decline') {
    return api.patch<ArtisanPartnership>(`/artisan-partnerships/${id}/respond`, { action })
  }

  return { create, listMine, listOpen, applyToOpen, cancel, pay, complete, review, listOffers, submitOffer, respondOffer, searchArtisans, createPartnership, myPartnerships, endPartnership, respondPartnership }
}

/** Bump après une création réussie pour que les pages qui listent les demandes se rechargent — même motif que useProModal. */
export function useArtisanRequestsRefresh() {
  return useState('artisanRequestsVersion', () => 0)
}
