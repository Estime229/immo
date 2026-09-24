/**
 * Sérialise les rafraîchissements de jeton concurrents.
 *
 * Le backend applique une rotation stricte : l'ancien refresh_token est supprimé
 * en base avant l'émission du nouveau, donc utilisable une seule fois. Sans ce
 * verrou, un paquet de requêtes qui prend un 401 simultanément relance N rafraîchissements
 * avec le même jeton ; un seul gagne, les autres effacent les jetons tout juste obtenus.
 *
 * Un seul appel de `refresh` en vol à la fois : les appels concurrents à
 * `refreshOnce()` s'abonnent tous à la même promesse et reçoivent le même résultat.
 */
export function createRefreshLock<T>(refresh: () => Promise<T>) {
  let inFlight: Promise<T> | null = null

  function refreshOnce(): Promise<T> {
    if (!inFlight) {
      inFlight = refresh().finally(() => {
        inFlight = null
      })
    }
    return inFlight
  }

  return { refreshOnce }
}
