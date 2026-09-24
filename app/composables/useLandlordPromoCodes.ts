import type { PromoCodeSummary } from '~/types/landlordBookings'
import type { FetchState } from '~/utils/fetchState'
import { deriveFetchState } from '~/utils/fetchState'

/**
 * Liste des codes promo du propriétaire connecté, partagée entre la page
 * `pro/reservations.vue` et `ProPromoModal.vue` (montée globalement dans
 * `layouts/pro.vue`, hors de l'arbre de la page) — même principe que
 * `useTenantLeases()` : un seul état partagé, un verrou anti-double-fetch.
 *
 * Le verrou vit sur `useNuxtApp()`, pas dans un `let` de module — un `let` de
 * module est partagé par tout le process Node en SSR (une seule instance de
 * module pour tous les visiteurs), donc une promesse en vol s'y retrouve
 * partagée entre requêtes SSR concurrentes de personnes différentes. Même
 * anti-motif que `sharedRefreshLock` (Lot 36) et `useTenantWallet`/
 * `useTenantLeases` (Lot 37) — ici sans échange d'identité (la promesse
 * résout dans le `useState` de la requête d'origine), mais un second
 * visiteur dont les codes promo seraient en cours de premier chargement au
 * même moment verrait son `items` rester vide indéfiniment.
 */
interface PromoCodesNuxtApp {
  _landlordPromoCodesInFlight?: Promise<void> | null
}

export function useLandlordPromoCodes() {
  const promoApi = usePromoCodesApi()
  const items = useState<PromoCodeSummary[]>('landlordPromoCodes', () => [])
  const state = useState<FetchState>('landlordPromoCodesState', () => 'idle')
  const nuxtApp = useNuxtApp() as unknown as PromoCodesNuxtApp

  async function reload() {
    state.value = 'loading'
    try {
      items.value = await promoApi.fetchMine()
      state.value = deriveFetchState({ loading: false, errored: false, itemCount: items.value.length })
    } catch {
      state.value = 'error'
    }
  }

  function ensureLoaded() {
    if (state.value === 'success' || state.value === 'empty' || state.value === 'loading') return nuxtApp._landlordPromoCodesInFlight ?? Promise.resolve()
    if (!nuxtApp._landlordPromoCodesInFlight) {
      nuxtApp._landlordPromoCodesInFlight = reload().finally(() => { nuxtApp._landlordPromoCodesInFlight = null })
    }
    return nuxtApp._landlordPromoCodesInFlight
  }

  return { items, state, ensureLoaded, reload }
}
