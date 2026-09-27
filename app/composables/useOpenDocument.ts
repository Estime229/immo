/**
 * Ouvre un document généré (contrat, quittance, état des lieux) dans un nouvel
 * onglet : PDF si possible, sinon aperçu HTML. Renvoie un message d'erreur,
 * ou `null` si le document s'est ouvert. `loadingKey` identifie le bouton en cours.
 */
export function useOpenDocument() {
  const pdfDoc = usePdfDocument()
  const preview = useProtectedFile()
  const loadingKey = ref<string | null>(null)

  async function open(key: string, pdfUrl: string, htmlUrl?: string): Promise<string | null> {
    loadingKey.value = key
    try {
      const result = await pdfDoc.fetchDocument(pdfUrl, htmlUrl)
      if (result.mode === 'pdf') {
        await preview.load(result.downloadUrl)
        if (preview.objectUrl.value) {
          window.open(preview.objectUrl.value, '_blank')
          return null
        }
        return preview.errorMessage.value ?? 'Aperçu indisponible.'
      }
      if (result.mode === 'html') {
        window.open(URL.createObjectURL(new Blob([result.html], { type: 'text/html' })), '_blank')
        return null
      }
      return result.message
    } finally {
      loadingKey.value = null
    }
  }

  return { open, loadingKey }
}
