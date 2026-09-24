const PROTECTED_PREFIXES = ['/locataire', '/pro', '/artisan', '/kyc']

/**
 * Sans cette garde, `/locataire`, `/pro`, `/artisan` et `/kyc` se chargeaient
 * quand même sans session (ou avec un jeton invalide) : toute la structure de
 * la page s'affichait, et chaque bloc de données échouait individuellement en
 * 401 avec un message générique trompeur au lieu d'une redirection claire
 * vers la connexion — voir TEST-CASES.md, AUTH-08/SYS-04.
 *
 * `fetchMe()` peut légitimement renvoyer `null` sans lever d'erreur (compte
 * tout juste créé, profil pas encore finalisé côté backend — voir
 * useAuthApi.ts) : ce n'est pas un échec d'authentification, donc ce cas ne
 * doit jamais rediriger vers `/connexion`. Seul un rejet réel (401 après
 * l'échec du rafraîchissement, jetons déjà effacés par `useApi()` à ce
 * moment-là) doit rediriger.
 */
export default defineNuxtRouteMiddleware(async to => {
  if (!PROTECTED_PREFIXES.some(p => to.path === p || to.path.startsWith(`${p}/`))) return

  const { accessToken } = useApiAuth()
  if (!accessToken.value) {
    return navigateTo('/connexion')
  }

  const { user, fetchMe } = useAuthApi()
  if (!user.value) {
    try {
      await fetchMe()
    } catch {
      return navigateTo('/connexion')
    }
  }
})
