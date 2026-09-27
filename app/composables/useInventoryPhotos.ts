import type { FileUploadResult, InventoryRoom } from '~/types/tenant'
import { fetchProtectedBlob } from '~/utils/protectedFile'
import { prepareUpload } from '~/utils/uploadFile'

/**
 * Photos d'un état des lieux (Lot 52). L'API accepte des URLs par élément
 * (`POST /files` puis `rooms[].items[].photos`) et les sert aux deux parties
 * par un relais authentifié, par index. Mais elle ne renvoie jamais ces URLs
 * (seulement `photo_count`), et un `PATCH` qui ne les contient pas les efface
 * (#71). `resolveExisting` récupère donc les photos déjà enregistrées puis les
 * renvoie, pour qu'aucun enregistrement n'en perde.
 */
export function useInventoryPhotos() {
  const api = useApi()
  const config = useRuntimeConfig()
  const { accessToken } = useApiAuth()
  const previews = new Map<string, string>()

  function serverUrl(inventoryId: string, ri: number, ii: number, pi: number) {
    return `${config.public.apiProxyBase}/inventories/${inventoryId}/rooms/${ri}/items/${ii}/photos/${pi}/download`
  }

  /** Aperçu d'une photo déjà enregistrée (mis en cache pour la session). */
  async function serverPreview(inventoryId: string, ri: number, ii: number, pi: number): Promise<string> {
    const key = `${inventoryId}:${ri}:${ii}:${pi}`
    const hit = previews.get(key)
    if (hit) return hit
    const { blob } = await fetchProtectedBlob(serverUrl(inventoryId, ri, ii, pi), accessToken.value)
    const url = URL.createObjectURL(blob)
    previews.set(key, url)
    return url
  }

  async function uploadRaw(file: File): Promise<string> {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('type', 'image')
    const res = await api.post<FileUploadResult>('/files', fd)
    previews.set(res.url, URL.createObjectURL(file))
    return res.url
  }

  /** Nouvelle photo prise ou choisie : compressée si besoin (4 Mo max), puis envoyée. */
  async function upload(file: File): Promise<string> {
    if (!file.type.startsWith('image/')) throw new Error('Choisissez une image (JPG, PNG ou WebP).')
    const prepared = await prepareUpload(file)
    if (prepared.error !== null) throw new Error(prepared.error)
    return uploadRaw(prepared.file)
  }

  /** Aperçu d'une photo ajoutée pendant la session (ou récupérée), par son URL de stockage. */
  function localPreview(storageUrl: string): string | null {
    return previews.get(storageUrl) ?? null
  }

  /**
   * Récupère les photos serveur encore référencées par index et les renvoie
   * comme nouvelles photos. À appeler juste avant un enregistrement.
   * Renvoie le nombre de photos qui n'ont pas pu être récupérées.
   */
  async function resolveExisting(inventoryId: string, rooms: InventoryRoom[], onProgress?: (done: number, total: number) => void): Promise<number> {
    const todo = rooms.flatMap(r => r.items.filter(i => (i._existing?.length ?? 0) > 0 && i._origin))
    const total = todo.reduce((n, i) => n + (i._existing?.length ?? 0), 0)
    let done = 0
    let lost = 0
    for (const item of todo) {
      const recovered: string[] = []
      for (const pi of item._existing ?? []) {
        try {
          const { blob } = await fetchProtectedBlob(serverUrl(inventoryId, item._origin!.ri, item._origin!.ii, pi), accessToken.value)
          recovered.push(await uploadRaw(new File([blob], `photo-${pi + 1}.webp`, { type: blob.type || 'image/webp' })))
        } catch {
          lost++
        }
        onProgress?.(++done, total)
      }
      item.photos = [...recovered, ...(item.photos ?? [])]
      item._existing = []
    }
    return lost
  }

  onUnmounted(() => {
    for (const url of previews.values()) URL.revokeObjectURL(url)
    previews.clear()
  })

  return { upload, serverPreview, localPreview, resolveExisting, serverUrl }
}
