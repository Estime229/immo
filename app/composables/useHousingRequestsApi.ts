import type { HousingRequestOpenItem, HousingRequestResponse, HousingRequestRespondResult, HousingRequestSummary, PaginatedResult } from '~/types/tenant'

export interface CreateHousingRequestPayload {
  description: string
  budget_min?: number
  budget_max?: number
  move_in_date?: string
  min_bedrooms?: number
}

export interface OpenHousingRequestsFilters {
  city_id?: string
  page?: number
  limit?: number
}

/**
 * Module demandes de logement — voir 12-INTEGRATION-LOCATAIRE.md, IL6.
 * Les critères structurés qui dépendent d'un référentiel (ville, quartier,
 * type de logement, équipements — via GET /ref) ne sont pas exposés dans le
 * formulaire de ce lot : seuls `description` (obligatoire) et les champs
 * simples sans dépendance à un référentiel sont câblés.
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
