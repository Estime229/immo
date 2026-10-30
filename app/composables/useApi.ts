import { ApiRequestError, createAuthenticatedFetcher, type RequestInitLike } from '~/utils/authenticatedFetcher'
import { errorText } from '~/utils/apiErrors'

/**
 * Point d'entrée unique pour tout appel API authentifié. Pose le Bearer,
 * retente une fois sur 401 via le verrou de rafraîchissement, mappe toute
 * erreur avec mapApiError (voir app/utils/apiErrors.ts).
 *
 * Les futurs composables d'endpoints (useAuthApi, useLeasesApi, …) s'appuient
 * sur celui-ci plutôt que d'appeler $fetch directement.
 */
export function useApi() {
  const config = useRuntimeConfig()
  const { accessToken, refreshOnce, clearTokens } = useApiAuth()
  const teamContext = useTeamContext()

  const fetcher = createAuthenticatedFetcher({
    getAccessToken: () => accessToken.value,
    refreshOnce: async () => {
      const pair = await refreshOnce()
      return { accessToken: pair.accessToken }
    },
    onAuthFailure: () => clearTokens(),
    // $fetch est appelé sans son typage de routes Nuxt (l'URL est celle de l'API distante, pas une
    // route du serveur Nuxt) : sinon TypeScript dépasse sa profondeur de comparaison (TS2321).
    doFetch: (url, opts) =>
      ($fetch as (request: string, options?: Record<string, unknown>) => Promise<unknown>)(url, {
        baseURL: config.public.apiProxyBase,
        ...opts
      })
  })

  function call<T = unknown>(url: string, opts: RequestInitLike = {}): Promise<T> {
    return fetcher.request<T>(url, opts, !!teamContext.value)
  }

  /**
   * Contrat repris de l'ancien projet immo-admin : `apiFetch(url, opts)` lève une `Error`
   * dont le message est déjà lisible et qui porte `status`. Les composables admin
   * (useUsers, useWallet…) s'en servent tels quels ; le reste d'Immo utilise get/post/….
   */
  async function apiFetch<T = unknown>(url: string, opts: RequestInitLike = {}): Promise<T> {
    try {
      return await call<T>(url, opts)
    } catch (err) {
      if (!(err instanceof ApiRequestError)) throw err
      const wrapped = new Error(errorText(err.mapped, 'Une erreur est survenue. Réessayez.')) as Error & { status?: number | null }
      wrapped.status = err.status
      throw wrapped
    }
  }

  return {
    apiFetch,
    get: <T = unknown>(url: string, query?: Record<string, unknown>) => call<T>(url, { method: 'GET', query }),
    post: <T = unknown>(url: string, body?: unknown) => call<T>(url, { method: 'POST', body }),
    patch: <T = unknown>(url: string, body?: unknown) => call<T>(url, { method: 'PATCH', body }),
    put: <T = unknown>(url: string, body?: unknown) => call<T>(url, { method: 'PUT', body }),
    delete: <T = unknown>(url: string, body?: unknown) => call<T>(url, { method: 'DELETE', body })
  }
}

/** team_id actif, posé par I2 (contexte d'équipe) — null tant que ce lot n'est pas câblé. */
export function useTeamContext() {
  return useState<string | null>('apiActiveTeamId', () => null)
}
