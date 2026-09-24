import { createRefreshLock } from '~/utils/refreshLock'

export interface TokenPair {
  accessToken: string
  refreshToken: string
}

export function useApiAuth() {
  const config = useRuntimeConfig()

  const accessToken = useCookie<string | null>('immo_access_token', {
    default: () => null,
    sameSite: 'lax'
  })
  const refreshToken = useCookie<string | null>('immo_refresh_token', {
    default: () => null,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30
  })

  function setTokens(pair: TokenPair) {
    accessToken.value = pair.accessToken
    refreshToken.value = pair.refreshToken
  }

  function clearTokens() {
    accessToken.value = null
    refreshToken.value = null
  }

  function isAuthenticated() {
    return !!accessToken.value
  }

  async function doRefresh(): Promise<TokenPair> {
    if (!refreshToken.value) throw new Error('Aucun refresh token disponible.')
    // Le champ du jeton d'accès s'appelle `token`, pas `access_token` — vérifié
    // sur le Swagger live (exemple de POST /auth/refresh), jamais recopié de mémoire.
    const res = await $fetch<{ token: string; refresh_token: string }>('/auth/refresh', {
      baseURL: config.public.apiProxyBase,
      method: 'POST',
      body: { refresh_token: refreshToken.value }
    })
    const pair: TokenPair = { accessToken: res.token, refreshToken: res.refresh_token }
    setTokens(pair)
    return pair
  }

  /**
   * Un seul verrou de rafraîchissement par session — pas un par composant — mais
   * porté par l'instance Nuxt courante, jamais par une variable de module. Côté
   * serveur, le module n'est chargé qu'une fois pour tout le process : un `let` de
   * module y survivait entre les requêtes de DIFFÉRENTS utilisateurs, donc un
   * rafraîchissement déclenché par la requête de l'utilisateur B réutilisait le
   * verrou (et les jetons fermés dessus) du tout premier utilisateur à avoir
   * rafraîchi depuis le démarrage du serveur — son profil s'affichait alors à la
   * place de celui de B (`GET /auth/me` retournait sa fiche). `useNuxtApp()` donne
   * une instance neuve par requête côté serveur, et une seule instance pour toute
   * la session côté client : exactement la portée voulue par le commentaire
   * d'origine, sans fuite entre utilisateurs. Voir 10-SOCLE-INTEGRATION.md,
   * "Le verrou de rafraîchissement".
   */
  const nuxtApp = useNuxtApp() as unknown as { _apiRefreshLock?: ReturnType<typeof createRefreshLock<TokenPair>> }
  if (!nuxtApp._apiRefreshLock) {
    nuxtApp._apiRefreshLock = createRefreshLock(doRefresh)
  }

  return {
    accessToken,
    refreshToken,
    setTokens,
    clearTokens,
    isAuthenticated,
    /** Rafraîchit le jeton — sérialisé, sûr à appeler depuis plusieurs requêtes en parallèle. */
    refreshOnce: nuxtApp._apiRefreshLock.refreshOnce
  }
}
