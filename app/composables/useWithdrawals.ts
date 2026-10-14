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

  /** Annulation d'une demande en attente (#83/#84) — recharge la liste pour refléter le re-crédit. */
  const cancellingId = useState<string | null>('withdrawalsCancellingId', () => null)
  const cancelError = useState('withdrawalsCancelError', () => '')
  async function cancel(id: string) {
    cancellingId.value = id
    cancelError.value = ''
    try {
      await walletApi.cancelWithdrawal(id)
      await load()
    } catch {
      cancelError.value = "La demande n'a pas pu être annulée. Réessayez."
    } finally {
      cancellingId.value = null
    }
  }

  return { list, state, pending, load, cancel, cancellingId, cancelError }
}
