import { mapApiError, type ApiErrorPayload, type MappedApiError } from './apiErrors'

export interface HttpError {
  status: number
  data: ApiErrorPayload | null
}

export function toHttpError(err: unknown): HttpError | null {
  const e = err as { status?: number; statusCode?: number; response?: { status?: number; _data?: unknown }; data?: unknown }
  const status = e?.status ?? e?.statusCode ?? e?.response?.status
  if (typeof status !== 'number') return null
  const data = (e?.data ?? e?.response?._data ?? null) as ApiErrorPayload | null
  return { status, data }
}

export interface AuthenticatedFetcherDeps {
  getAccessToken: () => string | null
  /** Doit retourner le nouveau jeton d'accès. Passe déjà par le verrou de rafraîchissement. */
  refreshOnce: () => Promise<{ accessToken: string }>
  /** Appelé uniquement si refreshOnce() lui-même échoue — jamais depuis une requête secondaire. */
  onAuthFailure: () => void
  doFetch: (url: string, opts: RequestInitLike) => Promise<unknown>
}

export interface RequestInitLike {
  method?: string
  headers?: Record<string, string>
  body?: unknown
  query?: Record<string, unknown>
}

export class ApiRequestError extends Error {
  mapped: MappedApiError
  status: number | null
  constructor(mapped: MappedApiError, status: number | null) {
    super(mapped.bannerMessage ?? 'Erreur API')
    this.mapped = mapped
    this.status = status
  }
}

/**
 * Fabrique un exécuteur de requêtes authentifiées : pose le Bearer, retente une
 * seule fois sur 401 via le verrou de rafraîchissement, et convertit toute
 * erreur HTTP en ApiRequestError via mapApiError.
 *
 * `request` ne rejoue jamais plus d'une fois — un second 401 après rafraîchissement
 * remonte directement, il n'y a pas de boucle possible.
 */
export function createAuthenticatedFetcher(deps: AuthenticatedFetcherDeps) {
  function withAuth(opts: RequestInitLike, token: string | null): RequestInitLike {
    return {
      ...opts,
      headers: {
        ...opts.headers,
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      }
    }
  }

  async function request<T = unknown>(url: string, opts: RequestInitLike = {}, isTeamContext = false): Promise<T> {
    try {
      return (await deps.doFetch(url, withAuth(opts, deps.getAccessToken()))) as T
    } catch (err) {
      const httpErr = toHttpError(err)

      if (httpErr?.status === 401) {
        let refreshed: { accessToken: string }
        try {
          refreshed = await deps.refreshOnce()
        } catch {
          deps.onAuthFailure()
          throw new ApiRequestError(mapApiError(null, 401, { isTeamContext }), 401)
        }
        try {
          return (await deps.doFetch(url, withAuth(opts, refreshed.accessToken))) as T
        } catch (retryErr) {
          const retryHttpErr = toHttpError(retryErr)

          if (retryHttpErr?.status === 401) {
            // Le rafraîchissement a réussi (jeton neuf, valide) mais la requête rejouée
            // 401 quand même. La rotation stricte ne vérifie pas le statut du compte
            // côté serveur (voir 11-INTEGRATION-AUTH-ET-PUBLIC.md, I1 point 2) : c'est
            // la signature d'un compte suspendu/banni, pas d'une session juste expirée.
            // Ici la session ne peut structurellement pas continuer, donc on efface les
            // jetons — contrairement à un 401 secondaire ordinaire, ce n'est pas "une
            // requête parmi d'autres qui échoue", c'est la confirmation que ce jeton
            // tout juste émis est refusé.
            deps.onAuthFailure()
            throw new ApiRequestError(
              {
                kind: 'account_suspended',
                fieldErrors: {},
                bannerMessage: 'Votre compte a été suspendu. Contactez le support pour en savoir plus.'
              },
              401
            )
          }

          throw new ApiRequestError(
            mapApiError(retryHttpErr?.data ?? null, retryHttpErr?.status ?? null, { isTeamContext }),
            retryHttpErr?.status ?? null
          )
        }
      }

      throw new ApiRequestError(
        mapApiError(httpErr?.data ?? null, httpErr?.status ?? null, { isTeamContext }),
        httpErr?.status ?? null
      )
    }
  }

  return { request }
}
