export type AdminUserRole = 'tenant' | 'landlord' | 'agent' | 'agency' | 'artisan' | 'admin'
export type UserStatus = 'active' | 'restricted' | 'banned'
export type KycStatus = 'pending' | 'verified' | 'rejected'

export const ADMIN_ROLE_LABELS: Record<AdminUserRole, string> = {
  tenant: 'Locataire',
  landlord: 'Propriétaire',
  agent: 'Agent',
  agency: 'Agence',
  artisan: 'Artisan',
  admin: 'Admin'
}

export interface UserListItem {
  id: string
  phone_number: string | null
  first_name: string | null
  last_name: string | null
  email: string
  avatar_url: string | null
  is_profile_complete: boolean
  is_verified: boolean
  preferred_lang: string
  role: AdminUserRole
  roles?: AdminUserRole[]
  status: UserStatus
  admin_level: number | null
  created_at: string
  updated_at: string
  has_id_card: boolean
  landlord_kyb_status: KybStatus | null
  landlord_kyb_rejection_reason: string | null
  agency_kyb_status: KybStatus | null
  agency_kyb_rejection_reason: string | null
  profile?: { id: string; kyc_status: KycStatus; kyc_submitted_at: string | null; kyc_reviewed_at: string | null; completion_score: number }
}

export interface UserListResponse {
  data: UserListItem[]
  total: number
  page: number
  limit: number
}

export interface UserProfile {
  id: string
  kyc_status: KycStatus
  kyc_submitted_at: string | null
  kyc_reviewed_at: string | null
  kyc_rejection_reason: string | null
}

export type KybProfileType = 'landlord' | 'agency'
export type KybStatus = 'pending' | 'approved' | 'rejected'

export interface KybInfo {
  profile_type: KybProfileType
  status: KybStatus | null
  reviewed_at: string | null
  rejection_reason: string | null
  company: string | null
  ifu: string | null
  rccm: string | null
}

export interface UserDetail {
  id: string
  phone_number: string
  first_name: string
  last_name: string
  email: string
  avatar_url: string | null
  is_profile_complete?: boolean
  is_verified?: boolean
  preferred_lang?: string
  has_id_card?: boolean
  kyb?: KybInfo | null
  role: AdminUserRole
  /** Tous les rôles du compte (un propriétaire est souvent aussi locataire). */
  roles?: AdminUserRole[]
  status: UserStatus
  admin_level?: number | null
  created_at: string
  updated_at: string
  profile?: UserProfile
}

export type AdminUpdatableRole = 'tenant' | 'landlord' | 'agent' | 'admin'

export interface UpdateAdminLevelInput {
  role?: AdminUpdatableRole
  admin_level?: number | null
  permissions?: string[]
}

export interface CreateAdminUserInput {
  first_name: string
  last_name: string
  email: string
  phone_number: string
  role: AdminUpdatableRole
  admin_level?: number
  permissions?: string[]
  password?: string
}

export interface UserStats {
  propertiesAsOwnerCount: number
  roomsAsOwnerCount: number
  propertiesAsAgentCount: number
  roomsAsAgentCount: number
  walletBalanceTotal: string
  walletBalanceSavings: string
  transactionsCount: number
  lastTransactionAt: string | null
}

export interface UserDetailResponse {
  user: UserDetail
  stats: UserStats
}

export interface UserTransaction {
  id: string
  amount: string
  type: string
  status: string
  gateway_ref: string | null
  payment_method: string | null
  currency: string
  created_at: string
}

export interface UserTransactionsResponse {
  data: UserTransaction[]
  total: number
  page: number
  limit: number
}

export interface UsersQuery {
  page?: number
  limit?: number
  role?: string
  status?: UserStatus
  search?: string
  kycStatus?: KycStatus
}

export interface AdminStatsSignup {
  id: string
  phone_number: string | null
  role: AdminUserRole
  status: UserStatus
  created_at: string
}

export interface AdminStatsKycPending {
  userId: string
  phone_number: string
  role: AdminUserRole
  kycStatus: KycStatus
  submittedAt: string | null
}

export interface AdminStats {
  users: { total: number; active: number; restricted: number; banned: number; newLast30Days: number }
  kyc: { pending: number; verified: number; rejected: number }
  platform: {
    totalProperties: number
    totalUnits: number
    occupiedUnits: number
    occupancyRate: number
    totalRevenue: number
    revenueThisMonth: number
    pendingWithdrawals: number
    pendingWithdrawalsAmount: number
  }
  recentSignups: AdminStatsSignup[]
  kycPendingList: AdminStatsKycPending[]
}

/* ---------- Affichage des comptes (listes et fiche admin) ---------- */

type BadgeTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral'

export const USER_STATUS: Record<UserStatus, { label: string; tone: BadgeTone }> = {
  active: { label: 'Actif', tone: 'success' },
  restricted: { label: 'Restreint', tone: 'warning' },
  banned: { label: 'Banni', tone: 'danger' }
}

/** Tous les rôles du compte, rôle principal en tête : « Propriétaire, Locataire ». */
export function userRolesLabel(user: { role: AdminUserRole; roles?: AdminUserRole[] | null }): string {
  const all = [user.role, ...(user.roles ?? []).filter(r => r !== user.role)]
  return all.map(r => ADMIN_ROLE_LABELS[r] ?? r).join(', ')
}

interface KycSubject {
  role: AdminUserRole
  has_id_card?: boolean
  profile?: { kyc_status: KycStatus | string; kyc_submitted_at: string | null } | null
}

/**
 * Pastille KYC d'un compte. L'API met `pending` dès la création du compte, avant tout dépôt :
 * la date de dépôt distingue « à vérifier » de « rien déposé ». Pas de pastille pour un admin.
 */
export function userKycBadge(user: KycSubject): { label: string; tone: BadgeTone } | null {
  if (user.role === 'admin' || !user.profile) return null
  if (user.profile.kyc_status === 'verified') return { label: 'KYC vérifié', tone: 'success' }
  if (user.profile.kyc_status === 'rejected') return { label: 'KYC refusé', tone: 'danger' }
  return user.profile.kyc_submitted_at || user.has_id_card
    ? { label: 'KYC à vérifier', tone: 'warning' }
    : { label: 'KYC non déposé', tone: 'neutral' }
}

/** Un dossier KYC existe (dossier soumis ou pièce déposée) : le lien vers /admin/kyc/<id> a quelque chose à montrer. */
export function hasKycFile(user: KycSubject): boolean {
  return user.role !== 'admin' && !!(user.profile?.kyc_submitted_at || user.has_id_card)
}

/** Format exigé par l'API pour un téléphone (E.164) : `+22990123456`. */
export const E164_PHONE = /^\+[1-9]\d{6,14}$/

export function normalizePhone(raw: string): string {
  return raw.replace(/[\s.\-()]/g, '')
}

export const TRANSACTION_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  completed: { label: 'Réussie', tone: 'success' },
  success: { label: 'Réussie', tone: 'success' },
  pending: { label: 'En attente', tone: 'warning' },
  processing: { label: 'En cours', tone: 'info' },
  failed: { label: 'Échouée', tone: 'danger' },
  cancelled: { label: 'Annulée', tone: 'neutral' },
  refunded: { label: 'Remboursée', tone: 'info' }
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  wallet_auto_debit: 'Prélèvement sur le wallet',
  wallet: 'Wallet',
  mtn_momo: 'MTN MoMo',
  moov_money: 'Moov Money',
  bank_transfer: 'Virement bancaire',
  card: 'Carte bancaire'
}

export function paymentMethodLabel(method: string | null | undefined): string {
  if (!method) return ''
  const key = method.toLowerCase()
  return PAYMENT_METHOD_LABELS[key] ?? key.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase())
}

export function useUsers() {
  const { apiFetch } = useApi()

  function fetchUsers(query: UsersQuery) {
    return apiFetch<UserListResponse>('/user/all', { query: { ...query } })
  }

  function fetchUserDetail(id: string) {
    return apiFetch<UserDetailResponse>('/user/detail', { query: { id } })
  }

  function fetchUserTransactions(id: string, page = 1, limit = 5) {
    return apiFetch<UserTransactionsResponse>('/user/detail/transactions', { query: { id, page, limit } })
  }

  /** `email` facultatif : l'API refuse une chaîne vide (IsEmail), on ne l'envoie que s'il est renseigné. */
  function createUser(data: { phone_number: string; first_name: string; last_name: string; email?: string; role: AdminUserRole; preferred_lang?: string }) {
    return apiFetch<UserDetail>('/user/create', { method: 'POST', body: { preferred_lang: 'fr', ...data } })
  }

  function changeStatus(id: string, status: UserStatus, reason: string) {
    return apiFetch<{ id: string; status: string; message: string }>(`/user/${id}/status`, {
      method: 'PATCH',
      body: { status, reason }
    })
  }

  function reviewKyc(id: string, action: 'approve' | 'reject', rejectionReason?: string) {
    return apiFetch<{ success: boolean; status: string }>(`/user/${id}/kyc`, {
      method: 'POST',
      body: { action, rejection_reason: rejectionReason }
    })
  }

  function fetchAdminStats() {
    return apiFetch<AdminStats>('/user/admin-stats')
  }

  function fetchIdCardBlob(id: string) {
    return apiFetch<Blob>(`/user/${id}/id-card`, { responseType: 'blob' })
  }

  function reviewKyb(id: string, profileType: KybProfileType, action: 'approve' | 'reject', rejectionReason?: string) {
    return apiFetch<{ success: boolean; status: string }>(`/user/${id}/kyb`, {
      method: 'POST',
      body: { profile_type: profileType, action, rejection_reason: rejectionReason }
    })
  }

  function assignRbacRole(id: string, roleId: string, reason: string) {
    return apiFetch<{ id: string; email: string; status: string; rbac_role: { id: string; name: string; description?: string; is_system: boolean } }>(`/user/${id}/rbac-role`, {
      method: 'PATCH',
      body: { roleId, reason }
    })
  }

  function updateAdminLevel(id: string, data: UpdateAdminLevelInput) {
    return apiFetch<{ id: string; role: string; admin_level: number | null; message: string }>(`/user/admin/update-level/${id}`, {
      method: 'PATCH',
      body: data
    })
  }

  function createAdminUser(data: CreateAdminUserInput) {
    return apiFetch<{ id: string; email: string; role: string; admin_level: number | null; message: string }>('/user/admin/create-user', {
      method: 'POST',
      body: data
    })
  }

  return { fetchUsers, fetchUserDetail, fetchUserTransactions, createUser, changeStatus, reviewKyc, fetchAdminStats, updateAdminLevel, createAdminUser, fetchIdCardBlob, reviewKyb, assignRbacRole }
}

/* ---------- File KYC ---------- */

/**
 * Tri accepté par GET /user/all (Swagger, vérifié en live) : `sortBy` created_at | completion_score,
 * `sortOrder` ASC | DESC. Pas de tri par date de dépôt de la pièce.
 */
export interface UsersSortQuery extends UsersQuery {
  sortBy?: 'created_at' | 'completion_score'
  sortOrder?: 'ASC' | 'DESC'
}

/** Dossiers en attente, comptes les plus anciens d'abord : l'ordre de traitement de la file KYC. */
export const KYC_QUEUE_QUERY: UsersSortQuery = { kycStatus: 'pending', sortBy: 'created_at', sortOrder: 'ASC', page: 1, limit: 100 }

/**
 * Dossier à ouvrir après une décision : celui qui suivait dans la file (le dossier traité en est
 * sorti, son successeur a pris sa place), sinon le premier. `null` quand la file est vide.
 */
export function nextKycDossier(queueIds: string[], decidedId: string, previousIndex: number): string | null {
  const remaining = queueIds.filter(id => id !== decidedId)
  if (!remaining.length) return null
  return remaining[previousIndex >= 0 && previousIndex < remaining.length ? previousIndex : 0] ?? null
}

/** Justificatifs KYC/KYB déposés par un compte (bulletins, RCCM…). Permission `view:users` côté API. */
export function useKycDocuments() {
  const { apiFetch } = useApi()

  function fetchUserDocuments(userId: string) {
    return apiFetch<Array<import('~/types/kyc').KycDocument>>(`/kyc/documents/user/${userId}`)
  }

  function fetchDocumentBlob(documentId: string) {
    return apiFetch<Blob>(`/kyc/documents/${documentId}/download`, { responseType: 'blob' })
  }

  return { fetchUserDocuments, fetchDocumentBlob }
}

/** Au plus 10 pages de 100 comptes « pending » examinées pour bâtir la file. */
export const KYC_QUEUE_MAX_PAGES = 10

export interface SubmittedKycQueue {
  /** Dossiers réellement déposés (`hasKycFile`), le plus ancien dépôt d'abord. */
  dossiers: UserListItem[]
  /** Comptes « pending » examinés qui n'ont encore rien déposé. */
  notSubmitted: number
  /** Le plafond de pages a été atteint : des comptes plus récents n'ont pas été examinés. */
  truncated: boolean
}

/**
 * File KYC réelle. L'API met `pending` dès la création du compte et n'offre aucun filtre
 * « dossier déposé » : on lit les comptes en attente page par page (en séquence) et on garde
 * ceux qui ont une pièce ou une date de soumission.
 */
export async function fetchSubmittedKycQueue(
  fetchUsers: (query: UsersQuery) => Promise<UserListResponse>,
  opts: { search?: string } = {}
): Promise<SubmittedKycQueue> {
  const dossiers: UserListItem[] = []
  let seen = 0
  let total = 0
  for (let page = 1; page <= KYC_QUEUE_MAX_PAGES; page++) {
    const query: UsersSortQuery = { ...KYC_QUEUE_QUERY, page, ...(opts.search ? { search: opts.search } : {}) }
    const res = await fetchUsers(query)
    total = res.total
    seen += res.data.length
    dossiers.push(...res.data.filter(hasKycFile))
    if (!res.data.length || seen >= total) break
  }
  const submittedAt = (u: UserListItem) => u.profile?.kyc_submitted_at ?? u.created_at
  dossiers.sort((a, b) => submittedAt(a).localeCompare(submittedAt(b)))
  return { dossiers, notSubmitted: seen - dossiers.length, truncated: seen < total }
}
