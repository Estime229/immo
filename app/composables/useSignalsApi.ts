import type { FileUploadResult, SignalPriority, SignalSummary, SignalType, UpdateSignalPayload } from '~/types/tenant'

export interface CreateSignalPayload {
  unit_id: string
  signal_type: SignalType
  title: string
  description: string
  priority?: SignalPriority
  lease_id?: string
  attachments?: string[]
}

/** Signalements — voir 12-INTEGRATION-LOCATAIRE.md, IL6. */
export function useSignalsApi() {
  const api = useApi()
  const config = useRuntimeConfig()

  async function list(filters: { signal_type?: string; status?: string } = {}) {
    return api.get<SignalSummary[]>('/signals', filters)
  }

  /** `unit_id` doit être un logement réellement lié au locataire (bail actif) — pas de recherche libre dans ce lot. */
  async function create(payload: CreateSignalPayload) {
    return api.post<SignalSummary>('/signals', payload)
  }

  /** multipart/form-data — même motif que le dépôt KYC (Lot 3) : le relais transmet le corps brut, boundary compris. */
  async function uploadFile(file: File) {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('type', 'image')
    return api.post<FileUploadResult>('/files', formData)
  }

  /** Ni la liste ni le détail ne renvoient les URLs des pièces jointes — seul ce point d'accès protégé, par index, les sert. */
  function attachmentDownloadUrl(signalId: string, index: number) {
    return `${config.public.apiProxyBase}/signals/${signalId}/attachments/${index}/download`
  }

  /** Traitement côté propriétaire — changer le statut/priorité, assigner un artisan (nom libre), noter la résolution. 400 si la transition de statut est invalide, mappé génériquement. */
  async function update(id: string, payload: UpdateSignalPayload) {
    return api.patch<SignalSummary>(`/signals/${id}`, payload)
  }

  return { list, create, uploadFile, attachmentDownloadUrl, update }
}
