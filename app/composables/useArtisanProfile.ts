import type { ArtisanProfile } from '~/types/artisan'
import type { RefEntry } from '~/types/reference'

type LoadState = 'idle' | 'loading' | 'success' | 'error'

/**
 * Profil artisan de l'appelant et référentiel des métiers, partagés par toutes les pages de
 * l'espace (avant : le même bloc « fetch profil + ARTISAN_TRADE » recopié dans six fichiers,
 * avec `profile = null` pendant le chargement — l'avertissement « Renseignez votre métier »
 * clignotait à chaque visite et s'affichait aussi sur une panne).
 *
 * Un seul appel tant que `load()` n'est pas redemandé ; l'état distingue le chargement, l'échec
 * et « chargé sans métier » (`missingTrade`). Même verrou anti-double-fetch que useTenantWallet.
 */
export function useArtisanProfile() {
  const profileApi = useArtisanProfileApi()
  const refData = useReferenceData()
  const pub = usePublicApi()
  const nuxtApp = useNuxtApp() as unknown as { _artisanProfileInFlight?: Promise<void> | null; _artisanTradesInFlight?: Promise<void> | null }

  const profile = useState<ArtisanProfile | null>('artisanProfile', () => null)
  const state = useState<LoadState>('artisanProfileState', () => 'idle')
  const trades = useState<RefEntry[]>('artisanTrades', () => [])
  const tradesState = useState<LoadState>('artisanTradesState', () => 'idle')

  async function load() {
    state.value = 'loading'
    try {
      profile.value = await profileApi.fetchMine()
      state.value = 'success'
    } catch {
      state.value = 'error'
    }
  }

  function ensureLoaded() {
    if (state.value === 'success' || state.value === 'loading') return nuxtApp._artisanProfileInFlight ?? Promise.resolve()
    if (!nuxtApp._artisanProfileInFlight) {
      nuxtApp._artisanProfileInFlight = load().finally(() => { nuxtApp._artisanProfileInFlight = null })
    }
    return nuxtApp._artisanProfileInFlight
  }

  /** Recharge sans repasser par l'état de chargement (après un ajout au portfolio) : un échec garde l'affichage actuel. */
  async function refresh(): Promise<boolean> {
    try {
      profile.value = await profileApi.fetchMine()
      state.value = 'success'
      return true
    } catch {
      return false
    }
  }

  /** Après un `PATCH /artisans/me` : la réponse fait foi, inutile de refetcher. */
  function setProfile(p: ArtisanProfile | null) {
    profile.value = p
    state.value = 'success'
  }

  async function loadTrades() {
    tradesState.value = 'loading'
    try {
      // Le cache de useReferenceData garde aussi une promesse en échec : le nouvel essai repasse par l'API.
      trades.value = await refData.fetchRef('ARTISAN_TRADE').catch(() => pub.get<RefEntry[]>('/ref', { type: 'ARTISAN_TRADE' }))
      tradesState.value = 'success'
    } catch {
      tradesState.value = 'error'
    }
  }

  function ensureTrades() {
    if (tradesState.value === 'success' || tradesState.value === 'loading') return nuxtApp._artisanTradesInFlight ?? Promise.resolve()
    if (!nuxtApp._artisanTradesInFlight) {
      nuxtApp._artisanTradesInFlight = loadTrades().finally(() => { nuxtApp._artisanTradesInFlight = null })
    }
    return nuxtApp._artisanTradesInFlight
  }

  function tradeLabel(id?: string | null, fallback = 'Intervention') {
    return trades.value.find(t => t.id === id)?.labels.fr ?? fallback
  }

  const loaded = computed(() => state.value === 'success')
  /** Chargé ET sans métier : seul cas où l'on demande de compléter le profil. */
  const missingTrade = computed(() => state.value === 'success' && !profile.value?.trade_reference_id)
  const tradeId = computed(() => (state.value === 'success' ? profile.value?.trade_reference_id ?? null : null))

  return { profile, state, loaded, missingTrade, tradeId, trades, tradesState, ensureLoaded, load, refresh, setProfile, ensureTrades, loadTrades, tradeLabel }
}
