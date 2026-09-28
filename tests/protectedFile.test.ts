import { describe, expect, it, vi } from 'vitest'
import { fetchProtectedBlob, ProtectedFileError, protectedFileExists } from '../app/utils/protectedFile'

function fakeFetch(response: Partial<Response> & { ok: boolean; status: number }) {
  return vi.fn(async () => ({
    ok: response.ok,
    status: response.status,
    headers: response.headers ?? new Headers(),
    blob: response.blob ?? (async () => new Blob(['x']))
  })) as unknown as typeof fetch
}

describe('fetchProtectedBlob', () => {
  it('pose le Bearer et retourne le blob avec son content-type', async () => {
    const headers = new Headers({ 'content-type': 'image/jpeg' })
    const impl = fakeFetch({ ok: true, status: 200, headers })

    const result = await fetchProtectedBlob('/inventories/1/rooms/0/items/0/photos/0/download', 'tok-abc', impl)

    expect(impl).toHaveBeenCalledWith(
      '/inventories/1/rooms/0/items/0/photos/0/download',
      expect.objectContaining({ headers: { Authorization: 'Bearer tok-abc' } })
    )
    expect(result.contentType).toBe('image/jpeg')
    expect(result.blob).toBeInstanceOf(Blob)
  })

  it('un 404 lève une ProtectedFileError exploitable plutôt qu\'un emplacement vide silencieux', async () => {
    const impl = fakeFetch({ ok: false, status: 404 })
    await expect(fetchProtectedBlob('/x', 'tok', impl)).rejects.toBeInstanceOf(ProtectedFileError)
    try {
      await fetchProtectedBlob('/x', 'tok', impl)
    } catch (e) {
      expect((e as ProtectedFileError).status).toBe(404)
      expect((e as ProtectedFileError).message).toBeTruthy()
    }
  })

  it('une panne réseau (fetch qui rejette) lève aussi une ProtectedFileError, jamais un throw brut', async () => {
    const impl = vi.fn(async () => { throw new Error('network down') }) as unknown as typeof fetch
    await expect(fetchProtectedBlob('/x', 'tok', impl)).rejects.toBeInstanceOf(ProtectedFileError)
  })

  it('fonctionne sans jeton (n\'envoie simplement pas d\'en-tête Authorization)', async () => {
    const impl = fakeFetch({ ok: true, status: 200 })
    await fetchProtectedBlob('/x', null, impl)
    expect(impl).toHaveBeenCalledWith('/x', { headers: {} })
  })
})

describe('protectedFileExists', () => {
  const res = (status: number) => ({ ok: status >= 200 && status < 300, status, body: null }) as unknown as Response

  it('200 → présent, 404 → absent, autre ou réseau → inconnu', async () => {
    expect(await protectedFileExists('/f', 't', (async () => res(200)) as typeof fetch)).toBe(true)
    expect(await protectedFileExists('/f', 't', (async () => res(404)) as typeof fetch)).toBe(false)
    expect(await protectedFileExists('/f', 't', (async () => res(401)) as typeof fetch)).toBeNull()
    expect(await protectedFileExists('/f', 't', (async () => { throw new Error('offline') }) as typeof fetch)).toBeNull()
  })

  it("envoie le jeton d'accès", async () => {
    let auth: string | undefined
    await protectedFileExists('/f', 'abc', (async (_u: string, init?: RequestInit) => { auth = (init?.headers as Record<string, string>).Authorization; return res(200) }) as typeof fetch)
    expect(auth).toBe('Bearer abc')
  })
})
