import { fetchProtectedBlob } from '~/utils/protectedFile'
import type { FetchState } from '~/utils/fetchState'

/**
 * Récupère un fichier protégé (photo EDL, pièce jointe de signalement ou de
 * message, document KYC) et expose une URL d'objet utilisable dans un <img>
 * ou un lien de téléchargement. Libère l'URL au démontage.
 *
 * Chaque composant d'affichage doit avoir un repli en cas d'état 'error' —
 * vignette de secours, nom de fichier, bouton — jamais un emplacement vide.
 */
export function useProtectedFile() {
  const { accessToken } = useApiAuth()

  const state = ref<FetchState>('idle')
  const objectUrl = ref<string | null>(null)
  const errorMessage = ref<string | null>(null)

  function release() {
    if (objectUrl.value) {
      URL.revokeObjectURL(objectUrl.value)
      objectUrl.value = null
    }
  }

  async function load(downloadUrl: string) {
    release()
    state.value = 'loading'
    errorMessage.value = null
    try {
      const { blob } = await fetchProtectedBlob(downloadUrl, accessToken.value)
      objectUrl.value = URL.createObjectURL(blob)
      state.value = 'success'
    } catch (err) {
      errorMessage.value = err instanceof Error ? err.message : 'Ce fichier n\'a pas pu être récupéré.'
      state.value = 'error'
    }
  }

  onUnmounted(release)

  return { state, objectUrl, errorMessage, load, release }
}
