import { createAuthenticatedFetcher, type RequestInitLike } from '~/utils/authenticatedFetcher'

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
    doFetch: (url, opts) =>
      $fetch(url, {
        baseURL: config.public.apiProxyBase,
        ...opts
      } as Parameters<typeof $fetch>[1])
  })

  function call<T = unknown>(url: string, opts: RequestInitLike = {}): Promise<T> {
    return fetcher.request<T>(url, opts, !!teamContext.value)
  }

  return {
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
