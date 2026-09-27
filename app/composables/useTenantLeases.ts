import type { LeaseSummary } from '~/types/tenant'
import type { FetchState } from '~/utils/fetchState'
import { deriveFetchState } from '~/utils/fetchState'
import { pickDefaultLease } from '~/utils/leases'

/**
 * Liste des baux du locataire connecté, partagée entre le sélecteur de
 * logement de la sidebar (`layouts/locataire.vue`), le tableau de bord (IL1)
 * et l'écran de bail (IL2) — un seul appel à /leases/my par session tant que
 * `reload()` n'est pas demandé explicitement, plutôt qu'un fetch par écran.
 *
 * `ensureLoaded()` peut être appelé simultanément par la mise en page et la
 * page elle-même (deux `onMounted` proches) : verrouillé pour qu'un seul
 * appel réseau parte, même appelant `useTenantLeases()` séparément dans les
 * deux — même principe que le verrou de rafraîchissement du socle.
 *
 * Le verrou (`inFlight`) est porté par `useNuxtApp()`, jamais par un `let` de
 * module — un `let` de module survivrait entre les requêtes SSR de
 * différents visiteurs (même bug que `sharedRefreshLock`, Lot 36) : la
 * promesse en vol d'un premier locataire serait réutilisée pour un second,
 * dont `leases` resterait vide puisque la promesse résout dans le contexte
 * (et le `useState`) de la requête d'origine, jamais dans le sien.
 */
export function useTenantLeases() {
  const leasesApi = useLeasesApi()
  const authUser = useAuthUser()
  const leases = useState<LeaseSummary[]>('tenantLeases', () => [])
  const state = useState<FetchState>('tenantLeasesState', () => 'idle')
  const activeLeaseId = useState<string | null>('tenantActiveLeaseId', () => null)
  const nuxtApp = useNuxtApp() as unknown as { _tenantLeasesInFlight?: Promise<void> | null }

  // Par défaut, le bail qui attend une action (signature, entrée) puis l'actif — plus le dernier créé, souvent un brouillon (Lot 50).
  const activeLease = computed(() => leases.value.find(l => l.id === activeLeaseId.value) ?? pickDefaultLease(leases.value))

  async function reload() {
    state.value = 'loading'
    try {
      // `/leases/my` renvoie aussi les baux où l'on est propriétaire : l'espace locataire ne garde que les siens (Lot 50).
      const me = authUser.value?.id
      leases.value = (await leasesApi.fetchMine()).filter(l => !me || (l.tenant_id ?? l.tenant.id) === me)
      if (!activeLeaseId.value || !leases.value.some(l => l.id === activeLeaseId.value)) {
        activeLeaseId.value = pickDefaultLease(leases.value)?.id ?? null
      }
      state.value = deriveFetchState({ loading: false, errored: false, itemCount: leases.value.length })
    } catch {
      state.value = 'error'
    }
  }

  function ensureLoaded() {
    if (state.value === 'success' || state.value === 'empty' || state.value === 'loading') return nuxtApp._tenantLeasesInFlight ?? Promise.resolve()
    if (!nuxtApp._tenantLeasesInFlight) {
      nuxtApp._tenantLeasesInFlight = reload().finally(() => { nuxtApp._tenantLeasesInFlight = null })
    }
    return nuxtApp._tenantLeasesInFlight
  }

  function selectLease(id: string) {
    activeLeaseId.value = id
  }

  return { leases, state, activeLeaseId, activeLease, selectLease, ensureLoaded, reload }
}
