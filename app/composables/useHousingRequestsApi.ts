import type { HousingRequestOpenItem, HousingRequestResponse, HousingRequestRespondResult, HousingRequestSummary, PaginatedResult } from '~/types/tenant'

export interface CreateHousingRequestPayload {
  description: string
  city_id?: string
  neighborhood_id?: string
  budget_min?: number
  budget_max?: number
  move_in_date?: string
  min_bedrooms?: number
  unit_type_reference_id?: string
  desired_billing_frequency?: string
  desired_furnished_level?: string
}

/** Seuls filtres que l'API applique réellement (ville, fréquence) — les autres critères ne sont pas filtrables côté serveur. */
export interface OpenHousingRequestsFilters {
  city_id?: string
  desired_billing_frequency?: string
  page?: number
  limit?: number
}

/**
 * Module demandes de logement — voir 12-INTEGRATION-LOCATAIRE.md, IL6.
 * Depuis le Lot 47 le formulaire envoie aussi ville, quartier, type,
 * fréquence et ameublement : ville et fréquence sont les deux seuls filtres
 * que les propriétaires peuvent appliquer (`GET /open`), et aucune demande ne
 * les portait auparavant.
 */
export function useHousingRequestsApi() {
  const api = useApi()

  async function fetchMine() {
    return api.get<HousingRequestSummary[]>('/housing-requests/my')
  }

  async function create(payload: CreateHousingRequestPayload) {
    return api.post<HousingRequestSummary>('/housing-requests', payload)
  }

  /** Réservé à l'auteur — 403 sinon, mappé par apiErrors comme le reste. */
  async function fetchResponses(id: string) {
    return api.get<HousingRequestResponse[]>(`/housing-requests/${id}/responses`)
  }

  async function close(id: string) {
    return api.patch<HousingRequestSummary>(`/housing-requests/${id}/close`)
  }

  /** Vitrine publique (IP5) — aucune authentification requise, mais utile côté propriétaire pour parcourir avant de répondre. */
  async function fetchOpen(filters: OpenHousingRequestsFilters = {}) {
    return api.get<PaginatedResult<HousingRequestOpenItem>>('/housing-requests/open', filters)
  }

  /** Propose une unité déjà possédée par le propriétaire connecté — 403 si l'unité ne lui appartient pas, 400 si déjà proposée ou demande fermée. */
  async function respond(id: string, unitId: string, message?: string) {
    return api.post<HousingRequestRespondResult>(`/housing-requests/${id}/respond`, { unit_id: unitId, ...(message ? { message } : {}) })
  }

  return { fetchMine, create, fetchResponses, close, fetchOpen, respond }
}
