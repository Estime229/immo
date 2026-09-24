/**
 * Hydrate l'utilisateur connecté au démarrage de l'app si un jeton d'accès
 * existe déjà (visiteur qui revient) mais que GET /auth/me n'a pas encore été
 * appelé dans cette session. Sans ça, le header afficherait "Se connecter"
 * jusqu'à la première action qui déclenche fetchMe().
 */
export default defineNuxtPlugin(async () => {
  const { accessToken } = useApiAuth()
  const { user, fetchMe } = useAuthApi()

  if (accessToken.value && !user.value) {
    try {
      await fetchMe()
    } catch {
      // Jeton invalide/expiré au chargement : la prochaine requête authentifiée
      // passera par le rafraîchissement normal, ou l'échec restera visible à l'usage.
    }
  }
})
