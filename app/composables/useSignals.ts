export type SignalType =
  | 'maintenance_plomberie' | 'maintenance_electricite' | 'maintenance_serrurerie' | 'maintenance_peinture' | 'maintenance_autre'
  | 'dispute_landlord' | 'dispute_neighbor' | 'nuisance_sonore' | 'insalubrite' | 'infrastructure_commune'
  | 'tenant_leaving' | 'renewal_request' | 'autre'

export type SignalPriority = 'low' | 'medium' | 'high' | 'urgent'
export type SignalStatus = 'open' | 'in_review' | 'resolved' | 'closed' | 'cancelled'

/** Prénom et nom à null tant que le profil n'est pas rempli. */
export interface SignalPersonInfo {
  id: string
  first_name: string | null
  last_name: string | null
  email: string | null
}

export interface SignalUnitInfo {
  id: string
  name: string
  unit_status?: string
  price?: string
  surface_m2?: number | null
  floor?: number | null
  bedrooms_count?: number
  bathrooms_count?: number
}

export interface SignalPropertyInfo {
  id: string
  name: string
  building_type?: string
  address?: string | null
  status?: string
}

export interface SignalItem {
  id: string
  author_id: string
  landlord_id?: string | null
  unit_id?: string | null
  property_id?: string | null
  lease_id?: string | null
  signal_type: SignalType
  priority: SignalPriority
  title: string
  description: string
  /** Depuis le 11/08/2026, l'API ne renvoie plus les URL : seulement le nombre, servi par index (voir `fetchAttachmentBlob`). */
  attachment_count?: number
  /** Ancien format (URL en clair), gardé pour le compte si une réponse le renvoie encore. */
  attachments?: string[]
  visibility: string
  status: SignalStatus
  assigned_to?: string | null
  resolved_by?: string | null
  resolved_at?: string | null
  resolution_notes?: string | null
  created_at: string
  updated_at?: string
  author?: SignalPersonInfo | null
  resolver?: SignalPersonInfo | null
  unit?: SignalUnitInfo | null
  property?: SignalPropertyInfo | null
}

export const MAINTENANCE_TYPES: SignalType[] = ['maintenance_plomberie', 'maintenance_electricite', 'maintenance_serrurerie', 'maintenance_peinture', 'maintenance_autre']
export const DISPUTE_TYPES: SignalType[] = ['dispute_landlord', 'dispute_neighbor', 'nuisance_sonore', 'insalubrite', 'infrastructure_commune', 'tenant_leaving', 'renewal_request', 'autre']

export const SIGNAL_TYPE_LABELS: Record<SignalType, string> = {
  maintenance_plomberie: 'Plomberie',
  maintenance_electricite: 'Électricité',
  maintenance_serrurerie: 'Serrurerie',
  maintenance_peinture: 'Peinture',
  maintenance_autre: 'Maintenance — autre',
  dispute_landlord: 'Désaccord avec le propriétaire',
  dispute_neighbor: 'Désaccord de voisinage',
  nuisance_sonore: 'Nuisance sonore',
  insalubrite: 'Insalubrité',
  infrastructure_commune: 'Infrastructure commune',
  tenant_leaving: 'Départ de locataire',
  renewal_request: 'Demande de renouvellement',
  autre: 'Autre'
}

type BadgeTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral'

export const PRIORITY_LABELS: Record<SignalPriority, string> = { low: 'Basse', medium: 'Moyenne', high: 'Haute', urgent: 'Urgente' }
export const PRIORITY_TONE: Record<SignalPriority, BadgeTone> = { low: 'neutral', medium: 'neutral', high: 'warning', urgent: 'danger' }
export const PRIORITY_OPTIONS: SignalPriority[] = ['urgent', 'high', 'medium', 'low']

/** Mêmes libellés que l'espace propriétaire (utils/signals.ts), pour que les actions se lisent pareil. */
export const STATUS_LABELS: Record<SignalStatus, string> = {
  open: 'Ouvert',
  in_review: 'Pris en charge',
  resolved: 'Résolu',
  closed: 'Clôturé',
  cancelled: 'Annulé'
}
export const STATUS_TONE: Record<SignalStatus, BadgeTone> = {
  open: 'warning',
  in_review: 'info',
  resolved: 'success',
  closed: 'neutral',
  cancelled: 'neutral'
}
export const STATUS_OPTIONS: SignalStatus[] = ['open', 'in_review', 'resolved', 'closed', 'cancelled']

/** Alias plutôt qu'interface : passé tel quel en `query` (Record<string, unknown>). */
export type SignalsQuery = {
  signal_type?: SignalType
  status?: SignalStatus
}

export function useSignals() {
  const { apiFetch } = useApi()

  function fetchSignals(query: SignalsQuery = {}) {
    return apiFetch<SignalItem[]>('/signals', { query })
  }

  function fetchSignal(id: string) {
    return apiFetch<SignalItem>(`/signals/${id}`)
  }

  function updateSignal(id: string, data: { status?: SignalStatus; priority?: SignalPriority; assigned_to?: string; resolution_notes?: string }) {
    return apiFetch<SignalItem>(`/signals/${id}`, { method: 'PATCH', body: data })
  }

  /** Pièce jointe n° `index` (0 = la première), via le point d'accès protégé. */
  function fetchAttachmentBlob(id: string, index: number) {
    return apiFetch<Blob>(`/signals/${id}/attachments/${index}/download`, { responseType: 'blob' })
  }

  return { fetchSignals, fetchSignal, updateSignal, fetchAttachmentBlob }
}
