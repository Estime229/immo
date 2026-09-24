import { toHttpError, ApiRequestError, type RequestInitLike } from '~/utils/authenticatedFetcher'
import { mapApiError } from '~/utils/apiErrors'

/**
 * Appels API sans jeton — check-email, login, request-otp, verify-otp, google,
 * forgot-password, reset-password. Un 401 ici (mauvais mot de passe, code
 * expiré, jeton Firebase invalide) est une réponse métier normale, pas un
 * signal de rafraîchissement : n'utilise jamais useApi() / l'exécuteur
 * authentifié pour ces routes, sous peine de déclencher un rafraîchissement
 * de jeton absurde sur un simple échec de connexion.
 */
export function usePublicApi() {
  const config = useRuntimeConfig()

  async function call<T = unknown>(url: string, opts: RequestInitLike = {}): Promise<T> {
    try {
      return (await $fetch(url, {
        baseURL: config.public.apiProxyBase,
        ...opts
      } as Parameters<typeof $fetch>[1])) as T
    } catch (err) {
      const httpErr = toHttpError(err)
      throw new ApiRequestError(mapApiError(httpErr?.data ?? null, httpErr?.status ?? null), httpErr?.status ?? null)
    }
  }

  return {
    get: <T = unknown>(url: string, query?: Record<string, unknown>) => call<T>(url, { method: 'GET', query }),
    post: <T = unknown>(url: string, body?: unknown) => call<T>(url, { method: 'POST', body })
  }
}
