import type { CreateInventoryPayload, InventoryDetail, UpdateInventoryPayload } from '~/types/tenant'

/** Libellés FR pour `InventoryRoomItem.state` — chaîne libre côté API (pas d'énumération publiée), ce référentiel n'est qu'une convention front. */
export const INVENTORY_ITEM_STATES: { code: string; label: string }[] = [
  { code: 'good', label: 'Bon état' },
  { code: 'issue', label: 'À surveiller' },
  { code: 'damaged', label: 'Endommagé' }
]

/**
 * Module états des lieux — voir Swagger `Inventory (Etat des lieux)`, jamais
 * câblé avant ce lot. Rattaché à un bail OU une réservation, jamais les deux
 * (voir `CreateInventoryPayload`). Pas d'endpoint « les miens » : toujours
 * listé par bail ou par réservation, même famille que `/visits`/`/signals`
 * mais à l'échelle d'un seul contrat plutôt que d'un utilisateur entier.
 */
export function useInventoriesApi() {
  const api = useApi()

  async function fetchByLease(leaseId: string) {
    return api.get<InventoryDetail[]>(`/inventories/lease/${leaseId}`)
  }

  async function fetchByBooking(bookingId: string) {
    return api.get<InventoryDetail[]>(`/inventories/booking/${bookingId}`)
  }

  async function fetchOne(id: string) {
    return api.get<InventoryDetail>(`/inventories/${id}`)
  }

  async function create(payload: CreateInventoryPayload) {
    return api.post<InventoryDetail>('/inventories', payload)
  }

  /** 400 si déjà signé — verrouiller l'édition côté UI une fois `status === 'signed'`. */
  async function update(id: string, payload: UpdateInventoryPayload) {
    return api.patch<InventoryDetail>(`/inventories/${id}`, payload)
  }

  async function send(id: string) {
    return api.patch<InventoryDetail>(`/inventories/${id}/send`)
  }

  /**
   * Chaque partie appelle cette même route pour sa propre signature — passe à
   * `signed` une fois les deux posées. `signature` est obligatoire : vérifié
   * en direct (Lot 27) qu'un corps vide renvoie 200 sans rien enregistrer
   * (`tenant_signature`/`landlord_signature` restent `null`, statut inchangé)
   * — piège silencieux, pas une erreur explicite.
   */
  async function sign(id: string, signature: string) {
    return api.patch<InventoryDetail>(`/inventories/${id}/sign`, { signature })
  }

  return { fetchByLease, fetchByBooking, fetchOne, create, update, send, sign }
}
