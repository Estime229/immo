import type { ArtisanPortfolioItem, ArtisanProfile, ArtisanReview } from '~/types/artisan'
import type { FileUploadResult } from '~/types/tenant'

/** Profil artisan de l'appelant — `GET /artisans/me`, `null` tant qu'il n'a jamais été rempli. */
export interface UpdateArtisanProfilePayload {
  trade_reference_id?: string
  bio?: string
  years_experience?: number
}

export function useArtisanProfileApi() {
  const api = useApi()

  async function fetchMine() {
    return api.get<ArtisanProfile | null>('/artisans/me')
  }

  /** Crée le profil s'il n'existe pas encore — même appel pour la première configuration et une mise à jour. */
  async function update(payload: UpdateArtisanProfilePayload) {
    return api.patch<ArtisanProfile>('/artisans/me', payload)
  }

  /** Même endpoint générique que les pièces jointes de signalement (Lot 8) — l'URL renvoyée alimente ensuite `addPortfolioMedia`. */
  async function uploadFile(file: File) {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('type', 'image')
    return api.post<FileUploadResult>('/files', formData)
  }

  async function addPortfolioMedia(url: string, description?: string) {
    return api.post<ArtisanPortfolioItem & { id: string }>('/artisans/me/portfolio', description ? { url, description: { fr: description } } : { url })
  }

  async function removePortfolioMedia(mediaId: string) {
    return api.delete<{ success: boolean }>(`/artisans/me/portfolio/${mediaId}`)
  }

  /** `artisanId` est l'id du profil (`ArtisanProfile.id`), pas le `user_id` — voir le commentaire sur `ArtisanProfile`. */
  async function fetchReviews(artisanId: string) {
    return api.get<ArtisanReview[]>(`/artisans/${artisanId}/reviews`)
  }

  return { fetchMine, update, uploadFile, addPortfolioMedia, removePortfolioMedia, fetchReviews }
}
