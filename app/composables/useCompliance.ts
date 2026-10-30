export type DeletionStatus = 'pending' | 'approved' | 'blocked' | 'rejected' | 'completed'

/** Personne liée à une demande. Après anonymisation : « Utilisateur supprimé », email et téléphone vides. */
export interface DeletionPerson {
  id: string
  first_name: string | null
  last_name: string | null
  email: string | null
}

export interface DeletionRequest {
  id: string
  user_id: string | null
  requested_by: string | null
  status: DeletionStatus
  /** Origine : `self_request`, `admin_request` ou `apdp_order`. */
  reason: string
  /** Blocant (bail actif, solde du wallet) ; après un rejet, l'API y range le motif du rejet. */
  blocking_reason: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  processed_at: string | null
  retention_note: string | null
  created_at: string
  updated_at: string
  /** null si le compte n'existe plus en base. */
  user: (DeletionPerson & { phone_number: string | null }) | null
  requester: DeletionPerson | null
}

/**
 * Cycle côté API : une demande sans blocant est exécutée tout de suite (`completed`) ; sinon
 * elle reste `blocked` jusqu'à ce que la personne règle le blocant, ou qu'un admin l'anonymise
 * quand même ou la rejette. `approved` existe dans l'énumération mais l'API passe directement
 * à `completed`.
 */
export const DELETION_STATUS: Record<DeletionStatus, { label: string; tone: 'success' | 'warning' | 'danger' | 'info' | 'neutral' }> = {
  pending: { label: 'En attente', tone: 'warning' },
  blocked: { label: 'Bloquée', tone: 'warning' },
  approved: { label: 'Approuvée', tone: 'info' },
  completed: { label: 'Compte anonymisé', tone: 'neutral' },
  rejected: { label: 'Rejetée', tone: 'danger' }
}

export type DeletionBucket = 'todo' | 'done' | 'rejected'

export function deletionBucket(status: DeletionStatus): DeletionBucket {
  if (status === 'pending' || status === 'blocked') return 'todo'
  if (status === 'rejected') return 'rejected'
  return 'done'
}

export const DELETION_ORIGIN: Record<string, string> = {
  self_request: 'à sa demande',
  admin_request: 'demande créée par un administrateur',
  apdp_order: "sur ordre de l'APDP"
}

export function useCompliance() {
  const { apiFetch } = useApi()

  function fetchDeletionRequests(status?: DeletionStatus) {
    return apiFetch<DeletionRequest[]>('/compliance/deletion-requests', { query: status ? { status } : {} })
  }

  function reviewDeletionRequest(id: string, action: 'approve' | 'reject', rejectionReason?: string) {
    return apiFetch<DeletionRequest>(`/compliance/deletion-requests/${id}/review`, {
      method: 'POST',
      body: { action, rejection_reason: rejectionReason }
    })
  }

  return { fetchDeletionRequests, reviewDeletionRequest }
}
