import { pollPdfJob, type PdfJobStatus } from '~/utils/pdfJob'

export type DocumentResult =
  | { mode: 'pdf'; downloadUrl: string }
  | { mode: 'html'; html: string }
  | { mode: 'error'; message: string }

/**
 * Récupère un document PDF généré à la demande (contrat de bail, quittance,
 * reçu de séjour, facture d'artisan) : tente le PDF, borné à 20s, retombe sur
 * l'aperçu HTML synchrone quand la route le propose. Voir socle §6 — motif
 * unique, à réutiliser pour les quatre documents plutôt qu'à réécrire.
 */
export function usePdfDocument() {
  const api = useApi()
  const config = useRuntimeConfig()

  async function fetchJobStatus(jobId: string): Promise<PdfJobStatus> {
    return api.get<PdfJobStatus>(`/pdf-jobs/${jobId}`)
  }

  /**
   * `pdfUrl` doit répondre 202 avec `{ pdf_job_id }` (format=pdf, implicite
   * ou explicite selon la route). `htmlUrl` est optionnel : la quittance n'a
   * pas d'aperçu HTML synchrone, seul le contrat de bail en a un.
   */
  async function fetchDocument(pdfUrl: string, htmlUrl?: string): Promise<DocumentResult> {
    try {
      const job = await api.get<{ pdf_job_id: string }>(pdfUrl, { format: 'pdf' })
      const ready = await pollPdfJob(job.pdf_job_id, fetchJobStatus)
      if (ready?.status === 'ready') {
        return { mode: 'pdf', downloadUrl: `${config.public.apiProxyBase}/pdf-jobs/${ready.id}/download` }
      }
    } catch {
      // Échec du PDF : on retombe silencieusement sur l'aperçu HTML si disponible.
    }

    if (!htmlUrl) {
      return { mode: 'error', message: 'Le document PDF n\'a pas pu être généré. Réessayez dans un instant.' }
    }

    try {
      const html = await api.get<string>(htmlUrl, { format: 'html' })
      return { mode: 'html', html }
    } catch {
      return { mode: 'error', message: 'Ce document est momentanément indisponible.' }
    }
  }

  return { fetchDocument }
}
