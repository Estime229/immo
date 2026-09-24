import type { PropertySearchPage, PropertySearchResult, UnitSearchResult } from '~/types/property'
import type { CreatePropertyPayload, CreateUnitPayload, MediaItem, UpdatePropertyPayload, UpdateUnitPayload, UploadImageResult } from '~/types/landlordProperty'

/**
 * Gestion des biens du propriétaire — voir 13-INTEGRATION-PRO-ET-ARTISAN.md, IP2.
 * La lecture d'un bien précis réutilise `GET /property/:id`, la même route
 * publique que la fiche logement (I4) — fonctionne aussi bien pour un bien
 * non listé publiquement, tant qu'on en connaît l'id.
 */
export function useLandlordPropertiesApi() {
  const api = useApi()

  async function fetchMine(filters: { city?: string; status?: string; page?: number; limit?: number } = {}) {
    return api.get<PropertySearchPage>('/property/owner/me', filters)
  }

  /** `POST /property` exige un compte vérifié KYC — confirmé en direct (403 `error.KYC_REQUIRED`), voir IP1. */
  async function create(payload: CreatePropertyPayload) {
    return api.post<PropertySearchResult>('/property', payload)
  }

  async function update(id: string, payload: UpdatePropertyPayload) {
    return api.patch<PropertySearchResult>(`/property/${id}`, payload)
  }

  async function remove(id: string) {
    return api.delete<{ success: boolean }>(`/property/${id}`)
  }

  async function createUnit(propertyId: string, payload: CreateUnitPayload) {
    return api.post<UnitSearchResult>(`/property/${propertyId}/units`, payload)
  }

  async function updateUnit(propertyId: string, unitId: string, payload: UpdateUnitPayload) {
    return api.patch<UnitSearchResult>(`/property/${propertyId}/units/${unitId}`, payload)
  }

  async function removeUnit(propertyId: string, unitId: string) {
    return api.delete<{ success: boolean }>(`/property/${propertyId}/units/${unitId}`)
  }

  /** Deux étapes : upload du fichier (retourne une URL), puis rattachement de cette URL au bien. */
  async function uploadImage(file: File) {
    const formData = new FormData()
    formData.append('image', file)
    return api.post<UploadImageResult>('/property/upload-image', formData)
  }

  async function addMedia(propertyId: string, url: string, opts: { isPrimary?: boolean; rank?: number } = {}) {
    return api.post<MediaItem>('/property/media', { property_id: propertyId, url, type: 'image', is_primary: opts.isPrimary, rank: opts.rank })
  }

  return { fetchMine, create, update, remove, createUnit, updateUnit, removeUnit, uploadImage, addMedia }
}
