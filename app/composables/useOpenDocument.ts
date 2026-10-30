/**
 * Ouvre un document généré (contrat, quittance, état des lieux) dans un nouvel
 * onglet : PDF si possible, sinon aperçu HTML. Renvoie un message d'erreur,
 * ou `null` si le document s'est ouvert. `loadingKey` identifie le bouton en cours.
 */
export function useOpenDocument() {
  const pdfDoc = usePdfDocument()
  const preview = useProtectedFile()
  const loadingKey = ref<string | null>(null)

  /**
   * L'onglet est ouvert tout de suite, pendant le clic : ouvert après l'attente du document
   * (jusqu'à ~20 s), il était bloqué par Safari iOS et les navigateurs mobiles. Il reçoit
   * ensuite le document, ou se referme si la génération échoue.
   */
  async function open(key: string, pdfUrl: string, htmlUrl?: string): Promise<string | null> {
    loadingKey.value = key
    const tab = window.open('', '_blank')
    if (tab) {
      tab.document.title = 'Préparation du document…'
      tab.document.body.style.font = '15px system-ui, sans-serif'
      tab.document.body.style.padding = '32px'
      tab.document.body.textContent = 'Préparation du document…'
    }
    function show(url: string) {
      if (tab && !tab.closed) tab.location.href = url
      else window.open(url, '_blank')
    }
    try {
      const result = await pdfDoc.fetchDocument(pdfUrl, htmlUrl)
      if (result.mode === 'pdf') {
        await preview.load(result.downloadUrl)
        if (preview.objectUrl.value) {
          show(preview.objectUrl.value)
          return null
        }
        tab?.close()
        return preview.errorMessage.value ?? 'Aperçu indisponible.'
      }
      if (result.mode === 'html') {
        show(URL.createObjectURL(new Blob([result.html], { type: 'text/html' })))
        return null
      }
      tab?.close()
      return result.message
    } catch (err) {
      tab?.close()
      throw err
    } finally {
      loadingKey.value = null
    }
  }

  return { open, loadingKey }
}
