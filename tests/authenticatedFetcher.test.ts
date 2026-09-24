import { describe, expect, it, vi } from 'vitest'
import { createAuthenticatedFetcher, ApiRequestError } from '../app/utils/authenticatedFetcher'

function make401() {
  const err: any = new Error('Unauthorized')
  err.status = 401
  err.data = { statusCode: 401, message: 'Unauthorized' }
  return err
}

describe('createAuthenticatedFetcher', () => {
  it('pose le Bearer courant sur une requête simple', async () => {
    const doFetch = vi.fn(async () => ({ ok: true }))
    const { request } = createAuthenticatedFetcher({
      getAccessToken: () => 'tok-1',
      refreshOnce: async () => ({ accessToken: 'tok-2' }),
      onAuthFailure: vi.fn(),
      doFetch
    })

    await request('/leases/my')

    expect(doFetch).toHaveBeenCalledWith('/leases/my', expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer tok-1' })
    }))
  })

  it('sur 401, rafraîchit une fois puis rejoue la requête avec le nouveau jeton', async () => {
    const doFetch = vi.fn()
      .mockRejectedValueOnce(make401())
      .mockResolvedValueOnce({ ok: true })
    const refreshOnce = vi.fn(async () => ({ accessToken: 'fresh-token' }))
    const onAuthFailure = vi.fn()

    const { request } = createAuthenticatedFetcher({
      getAccessToken: () => 'stale-token',
      refreshOnce,
      onAuthFailure,
      doFetch
    })

    const result = await request('/wallet/me')

    expect(result).toEqual({ ok: true })
    expect(refreshOnce).toHaveBeenCalledTimes(1)
    expect(doFetch).toHaveBeenCalledTimes(2)
    expect(doFetch).toHaveBeenLastCalledWith('/wallet/me', expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer fresh-token' })
    }))
    expect(onAuthFailure).not.toHaveBeenCalled()
  })

  it('n\'efface les jetons que si le rafraîchissement lui-même échoue', async () => {
    const doFetch = vi.fn().mockRejectedValue(make401())
    const refreshOnce = vi.fn(async () => { throw new Error('refresh token expiré') })
    const onAuthFailure = vi.fn()

    const { request } = createAuthenticatedFetcher({
      getAccessToken: () => 'stale-token',
      refreshOnce,
      onAuthFailure,
      doFetch
    })

    await expect(request('/wallet/me')).rejects.toBeInstanceOf(ApiRequestError)
    expect(onAuthFailure).toHaveBeenCalledTimes(1)
  })

  it('un second 401 après rafraîchissement ne relance jamais de boucle (un seul rejeu, quoi qu\'il arrive)', async () => {
    const doFetch = vi.fn()
      .mockRejectedValueOnce(make401())
      .mockRejectedValueOnce(make401())
    const refreshOnce = vi.fn(async () => ({ accessToken: 'fresh-token' }))
    const onAuthFailure = vi.fn()

    const { request } = createAuthenticatedFetcher({
      getAccessToken: () => 'stale-token',
      refreshOnce,
      onAuthFailure,
      doFetch
    })

    await expect(request('/wallet/me')).rejects.toBeInstanceOf(ApiRequestError)
    expect(doFetch).toHaveBeenCalledTimes(2)
    expect(refreshOnce).toHaveBeenCalledTimes(1)
  })

  it('un 401 persistant après un rafraîchissement réussi est traité comme un compte suspendu, pas une session juste expirée', async () => {
    // Cas documenté en 11-INTEGRATION-AUTH-ET-PUBLIC.md, I1 point 2 : la rotation
    // stricte du refresh token ne vérifie pas le statut du compte côté serveur, donc
    // refreshOnce() réussit même pour un compte banni — mais la requête rejouée avec
    // ce jeton tout juste émis échoue quand même. Contrairement à un 401 secondaire
    // ordinaire, ici la session ne peut structurellement pas continuer : on efface
    // les jetons et on distingue le message de l'utilisateur banni de la session expirée.
    const doFetch = vi.fn()
      .mockRejectedValueOnce(make401())
      .mockRejectedValueOnce(make401())
    const refreshOnce = vi.fn(async () => ({ accessToken: 'fresh-token' }))
    const onAuthFailure = vi.fn()

    const { request } = createAuthenticatedFetcher({
      getAccessToken: () => 'stale-token',
      refreshOnce,
      onAuthFailure,
      doFetch
    })

    try {
      await request('/wallet/me')
      expect.unreachable('devait rejeter')
    } catch (e) {
      expect(e).toBeInstanceOf(ApiRequestError)
      expect((e as ApiRequestError).mapped.kind).toBe('account_suspended')
      expect((e as ApiRequestError).mapped.bannerMessage).toContain('suspendu')
    }
    expect(onAuthFailure).toHaveBeenCalledTimes(1)
  })

  it('convertit une erreur de validation 400 en ApiRequestError avec fieldErrors exploitables', async () => {
    const err: any = new Error('Bad Request')
    err.status = 400
    err.data = {
      statusCode: 400,
      error: 'VALIDATION_ERROR',
      message: 'Données invalides',
      violations: [{ field: 'email', rule: 'isEmail' }]
    }
    const doFetch = vi.fn().mockRejectedValue(err)

    const { request } = createAuthenticatedFetcher({
      getAccessToken: () => 'tok',
      refreshOnce: async () => ({ accessToken: 'tok' }),
      onAuthFailure: vi.fn(),
      doFetch
    })

    try {
      await request('/auth/login')
      expect.unreachable('devait rejeter')
    } catch (e) {
      expect(e).toBeInstanceOf(ApiRequestError)
      expect((e as ApiRequestError).mapped.fieldErrors.email).toBe('Adresse email invalide.')
    }
  })
})
