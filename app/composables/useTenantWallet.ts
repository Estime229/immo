import type { WalletSummary } from '~/types/wallet'
import type { FetchState } from '~/utils/fetchState'
import { deriveFetchState } from '~/utils/fetchState'

/**
 * Solde du wallet, partagé entre le tableau de bord, `/locataire/wallet` et
 * la modale de paiement — un seul appel à /wallet/me tant que `reload()`
 * n'est pas demandé, même verrou anti-double-fetch que useTenantLeases().
 *
 * `balance_total` (« Solde disponible ») et `balance_savings` (« Tirelire »)
 * ne bougent pas ensemble (IL4 point 3) : exposés séparément, jamais fusionnés.
 *
 * Le verrou anti-double-fetch (`inFlight`) est porté par `useNuxtApp()`, pas
 * par un `let` de module — même raison que `sharedRefreshLock` dans
 * `useApiAuth.ts` (Lot 36) : un `let` de module survit entre les requêtes SSR
 * de différents visiteurs, donc la promesse en vol d'un premier utilisateur
 * serait réutilisée (et jamais réappliquée) pour un second dont `wallet`
 * resterait alors indéfiniment vide/en chargement.
 */
export function useTenantWallet() {
  const walletApi = useWalletApi()
  const wallet = useState<WalletSummary | null>('tenantWallet', () => null)
  const state = useState<FetchState>('tenantWalletState', () => 'idle')
  const nuxtApp = useNuxtApp() as unknown as { _tenantWalletInFlight?: Promise<void> | null }

  const balanceTotal = computed(() => Number(wallet.value?.balance_total ?? 0))
  const balanceSavings = computed(() => Number(wallet.value?.balance_savings ?? 0))

  async function reload() {
    state.value = 'loading'
    try {
      wallet.value = await walletApi.fetchMe()
      state.value = deriveFetchState({ loading: false, errored: false, itemCount: 1 })
    } catch {
      state.value = 'error'
    }
  }

  function ensureLoaded() {
    if (state.value === 'success' || state.value === 'loading') return nuxtApp._tenantWalletInFlight ?? Promise.resolve()
    if (!nuxtApp._tenantWalletInFlight) {
      nuxtApp._tenantWalletInFlight = reload().finally(() => { nuxtApp._tenantWalletInFlight = null })
    }
    return nuxtApp._tenantWalletInFlight
  }

  return { wallet, state, balanceTotal, balanceSavings, ensureLoaded, reload }
}
