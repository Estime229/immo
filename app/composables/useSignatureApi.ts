/**
 * Signature manuscrite enregistrée sur le profil (`GET/PATCH /pdf/signature`,
 * PNG en base64). Existait côté API sans être utilisée : les états des lieux
 * étaient signés avec une image vide d'un pixel, imprimée telle quelle sur le
 * PDF (constaté Lot 50).
 */
export function useSignatureApi() {
  const api = useApi()

  async function fetchMine(): Promise<string | null> {
    const res = await api.get<{ signature: string | null }>('/pdf/signature')
    return res.signature || null
  }

  async function save(signature: string) {
    return api.patch<{ signature: string | null }>('/pdf/signature', { signature })
  }

  return { fetchMine, save }
}
