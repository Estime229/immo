import type { KycDocument, KycDocumentType } from '~/types/kyc'

/**
 * Module KYC/KYB — voir 11-INTEGRATION-AUTH-ET-PUBLIC.md, I3.
 * Le mieux aligné du produit : 4 endpoints, contrat déjà respecté côté proxy.
 */
export function useKycApi() {
  const api = useApi()
  const config = useRuntimeConfig()

  async function listMine() {
    return api.get<KycDocument[]>('/kyc/documents/mine')
  }

  /** multipart/form-data — le relais transmet le corps brut, boundary compris. */
  async function upload(file: File, documentType: KycDocumentType) {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('document_type', documentType)
    return api.post<KycDocument>('/kyc/documents', formData)
  }

  async function remove(id: string) {
    return api.delete<{ success: boolean }>(`/kyc/documents/${id}`)
  }

  /** URL relative (même origine, via le relais) — à passer telle quelle à useProtectedFile(). */
  function downloadUrl(id: string) {
    return `${config.public.apiProxyBase}/kyc/documents/${id}/download`
  }

  /**
   * Pièce d'identité — endpoint distinct de `/kyc/documents`, jamais un
   * couple recto/verso côté API : un seul fichier (`id_card`), écrasé à
   * chaque nouvel envoi. Voir `POST /user/id-card` (jamais lié dans l'écran
   * « Identité » avant ce lot — la maquette montrait deux cases recto/verso
   * qui n'ont pas de contrepartie API).
   */
  async function uploadIdCard(file: File) {
    const formData = new FormData()
    formData.append('id_card', file)
    return api.post<{ success: boolean }>('/user/id-card', formData)
  }

  /** Réservé au propriétaire du fichier ou à un admin — jamais l'URL de stockage, toujours les octets bruts. */
  function idCardDownloadUrl(userId: string) {
    return `${config.public.apiProxyBase}/user/${userId}/id-card`
  }

  return { listMine, upload, remove, downloadUrl, uploadIdCard, idCardDownloadUrl }
}
