import { describe, expect, it, vi } from 'vitest'
import { createRefreshLock } from '../app/utils/refreshLock'

describe('createRefreshLock', () => {
  it('sérialise les appels concurrents en un seul rafraîchissement réel', async () => {
    let callCount = 0
    const refresh = vi.fn(async () => {
      callCount++
      await new Promise(r => setTimeout(r, 10))
      return { accessToken: `token-${callCount}`, refreshToken: `refresh-${callCount}` }
    })

    const { refreshOnce } = createRefreshLock(refresh)

    // Cinq requêtes qui prennent un 401 au même instant, comme le Promise.all
    // documenté dans le socle.
    const results = await Promise.all([refreshOnce(), refreshOnce(), refreshOnce(), refreshOnce(), refreshOnce()])

    expect(refresh).toHaveBeenCalledTimes(1)
    for (const r of results) {
      expect(r).toEqual(results[0])
    }
  })

  it('autorise un nouveau rafraîchissement après résolution du précédent', async () => {
    const refresh = vi.fn(async () => ({ accessToken: 'a', refreshToken: 'b' }))
    const { refreshOnce } = createRefreshLock(refresh)

    await refreshOnce()
    await refreshOnce()

    expect(refresh).toHaveBeenCalledTimes(2)
  })

  it('libère le verrou même si le rafraîchissement échoue, sans le bloquer durablement', async () => {
    let attempt = 0
    const refresh = vi.fn(async () => {
      attempt++
      if (attempt === 1) throw new Error('refresh token invalide')
      return { accessToken: 'ok', refreshToken: 'ok' }
    })
    const { refreshOnce } = createRefreshLock(refresh)

    await expect(refreshOnce()).rejects.toThrow('refresh token invalide')
    await expect(refreshOnce()).resolves.toEqual({ accessToken: 'ok', refreshToken: 'ok' })
    expect(refresh).toHaveBeenCalledTimes(2)
  })

  it('un échec ne doit propager qu\'aux abonnés de ce cycle, jamais silencieusement réussir', async () => {
    const refresh = vi.fn(async () => {
      throw new Error('rotation refusée')
    })
    const { refreshOnce } = createRefreshLock(refresh)

    const calls = [refreshOnce(), refreshOnce(), refreshOnce()]
    const outcomes = await Promise.allSettled(calls)

    expect(refresh).toHaveBeenCalledTimes(1)
    for (const o of outcomes) {
      expect(o.status).toBe('rejected')
    }
  })
})
