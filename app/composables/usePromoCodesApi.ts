import type { CreatePromoCodePayload, PromoCodeSummary, UpdatePromoCodePayload } from '~/types/landlordBookings'

/** Codes promo sur les logements — voir 13-INTEGRATION-PRO-ET-ARTISAN.md, IP7. Toujours financés par le propriétaire, jamais par la plateforme. */
export function usePromoCodesApi() {
  const api = useApi()

  async function fetchMine() {
    return api.get<PromoCodeSummary[]>('/promo-codes/mine')
  }

  /** 403 si le bien/l'unité ciblé n'appartient pas à l'appelant — mappé génériquement. */
  async function create(payload: CreatePromoCodePayload) {
    return api.post<PromoCodeSummary>('/promo-codes', payload)
  }

  /**
   * `id` doit être dupliqué dans le corps de la requête, en plus de l'URL —
   * confirmé en direct : `UpdatePromoCodeCommand` ne le documente pas côté
   * Swagger, mais son absence renvoie 400 `{ field: 'id', rule: 'isUuid' }`.
   * Bug backend de validation, pas une intention documentée — contourné ici.
   */
  async function update(id: string, payload: UpdatePromoCodePayload) {
    return api.patch<PromoCodeSummary>(`/promo-codes/${id}`, { id, ...payload })
  }

  /** 400 si `uses_count > 0` — désactiver via update({ is_active: false }) plutôt que supprimer dans ce cas. */
  async function remove(id: string) {
    return api.delete<{ success: boolean }>(`/promo-codes/${id}`)
  }

  return { fetchMine, create, update, remove }
}
