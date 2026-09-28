import type { WithdrawalRequest } from '~/types/wallet'
import { pendingWithdrawal } from '~/utils/wallet'

/**
 * Demandes de retrait, partagées entre la modale et les listes des trois
 * espaces (Lot 55) : la modale sait s'il y a déjà une demande en attente
 * avant d'afficher le formulaire, et la liste se met à jour après l'envoi.
 */
export function useWithdrawals() {
  const walletApi = useWalletApi()
  const list = useState<WithdrawalRequest[]>('withdrawals', () => [])
  const state = useState<'idle' | 'loading' | 'success' | 'error'>('withdrawalsState', () => 'idle')

  async function load() {
    state.value = 'loading'
    try {
      list.value = [...(await walletApi.fetchWithdrawals())].sort((a, b) => b.created_at.localeCompare(a.created_at))
      state.value = 'success'
    } catch {
      state.value = 'error'
    }
  }

  const pending = computed(() => pendingWithdrawal(list.value))
  return { list, state, pending, load }
}
