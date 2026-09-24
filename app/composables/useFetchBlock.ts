import type { FetchState } from '~/utils/fetchState'
import { deriveFetchState } from '~/utils/fetchState'

/**
 * Un bloc de tableau de bord = une source, son propre état à 5 valeurs.
 * Voir 10-SOCLE-INTEGRATION.md §3 et 12-INTEGRATION-LOCATAIRE.md IL1 :
 * "chaque bloc porte son propre état... l'écran doit le montrer bloc par
 * bloc plutôt que d'afficher un état global." N'écrit jamais 'empty' sur un
 * échec — `deriveFetchState` l'interdit structurellement.
 */
export function useFetchBlock<T>(fetcher: () => Promise<T[]>) {
  const items = ref<T[]>([]) as Ref<T[]>
  const state = ref<FetchState>('idle')

  async function load() {
    state.value = 'loading'
    try {
      items.value = await fetcher()
      state.value = deriveFetchState({ loading: false, errored: false, itemCount: items.value.length })
    } catch {
      state.value = 'error'
    }
  }

  return { items, state, load }
}
