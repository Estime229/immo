/**
 * Voir 10-SOCLE-INTEGRATION.md §3.
 * Règle non négociable : un appel en échec est toujours 'error', jamais 'empty'.
 */
export type FetchState = 'idle' | 'loading' | 'success' | 'empty' | 'error'

export interface DeriveFetchStateInput {
  loading: boolean
  errored: boolean
  itemCount: number
  /** true si des filtres actifs réduisent un jeu de données non vide à zéro résultat. */
  isFiltered?: boolean
}

export type DerivedFetchState = FetchState | 'empty-filtered'

/**
 * Dérive l'état à partir des trois signaux bruts d'un composable de données.
 * Distingue 'empty' (aucune donnée) de 'empty-filtered' (des données existent,
 * aucune ne correspond aux filtres actifs) — les deux écrans sont différents.
 */
export function deriveFetchState(input: DeriveFetchStateInput): DerivedFetchState {
  if (input.loading) return 'loading'
  if (input.errored) return 'error'
  if (input.itemCount === 0) return input.isFiltered ? 'empty-filtered' : 'empty'
  return 'success'
}
