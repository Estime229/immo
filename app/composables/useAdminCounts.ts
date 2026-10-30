import { DISPUTE_TYPES, MAINTENANCE_TYPES } from './useSignals'
import { fetchSubmittedKycQueue, type UserListItem } from './useUsers'

/** Ce qui attend une action de l'équipe admin. `null` = inconnu (pas la permission, ou appel en échec). */
export interface AdminCounts {
  kyc: number | null
  withdrawals: number | null
  withdrawalsAmount: number | null
  disputes: number | null
  disputesUrgent: number | null
  maintenance: number | null
  contact: number | null
  deletions: number | null
}

const EMPTY: AdminCounts = {
  kyc: null,
  withdrawals: null,
  withdrawalsAmount: null,
  disputes: null,
  disputesUrgent: null,
  maintenance: null,
  contact: null,
  deletions: null
}

/**
 * Compteurs partagés par le menu, la barre mobile et le tableau de bord. Une page qui traite
 * un élément (KYC validé, retrait approuvé…) appelle `refresh()` : les pastilles du menu
 * baissent tout de suite au lieu d'attendre le prochain rechargement.
 */
export function useAdminCounts() {
  const counts = useState<AdminCounts>('admin-counts', () => ({ ...EMPTY }))
  const loaded = useState('admin-counts-loaded', () => false)
  /** Premiers dossiers KYC déposés, lus en même temps que le compteur (montrés sur l'aperçu). */
  const kycPreview = useState<UserListItem[]>('admin-kyc-preview', () => [])
  const { hasPermission } = useAdminAuth()
  const { fetchUsers } = useUsers()
  const { fetchPendingWithdrawals } = useWallet()
  const { fetchSignals } = useSignals()
  const { fetchMessages } = useContact()
  const { fetchDeletionRequests } = useCompliance()

  async function refresh() {
    loaded.value = true
    const next: AdminCounts = { ...EMPTY }
    await Promise.allSettled([
      // `kycStatus: 'pending'` inclut les comptes qui n'ont rien déposé : seuls les dossiers déposés comptent.
      hasPermission('manage:kyc') && fetchSubmittedKycQueue(fetchUsers).then(r => {
        next.kyc = r.dossiers.length
        kycPreview.value = r.dossiers.slice(0, 4)
      }),
      hasPermission('manage:withdrawals') && fetchPendingWithdrawals().then(r => {
        next.withdrawals = r.length
        next.withdrawalsAmount = r.reduce((sum, w) => sum + Number(w.amount || 0), 0)
      }),
      hasPermission('manage:leases') && fetchSignals().then(r => {
        const active = r.filter(s => s.status === 'open' || s.status === 'in_review')
        const disputes = active.filter(s => DISPUTE_TYPES.includes(s.signal_type))
        next.disputes = disputes.length
        next.disputesUrgent = disputes.filter(s => s.priority === 'urgent').length
        next.maintenance = active.filter(s => MAINTENANCE_TYPES.includes(s.signal_type)).length
      }),
      hasPermission('manage:contact') && fetchMessages({ handled: false, page: 1, limit: 1 }).then(r => { next.contact = r.total }),
      // Sans blocant, l'API anonymise tout de suite (`completed`) : ce qui attend l'équipe, ce sont
      // les demandes encore `pending` et surtout les `blocked` (bail actif, solde, litige…).
      hasPermission('manage:users') && fetchDeletionRequests().then(r => {
        next.deletions = r.filter(d => d.status === 'pending' || d.status === 'blocked').length
      })
    ])
    counts.value = next
  }

  /** Premier chargement uniquement — les écrans qui modifient une donnée appellent `refresh()`. */
  function ensure() {
    if (!loaded.value) refresh()
  }

  return { counts, kycPreview, refresh, ensure }
}
