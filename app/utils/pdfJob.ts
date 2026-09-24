/**
 * Sondage borné d'une tâche PDF asynchrone. Voir 10-SOCLE-INTEGRATION.md §6 :
 * « Le sondage doit être borné — 20 secondes maximum — et retomber sur
 * l'aperçu HTML en cas d'échec ou de dépassement. »
 *
 * Ce motif est réutilisé tel quel pour le contrat de bail (IL2), la quittance
 * (IL2), le reçu de séjour (IL5) et la facture d'artisan (IA1/IP10) — ne pas
 * le réécrire ailleurs.
 */

export type PdfJobRawStatus = 'pending' | 'processing' | 'ready' | 'failed'

export interface PdfJobStatus {
  id: string
  status: PdfJobRawStatus
  error_message: string | null
  download_url: string | null
}

export interface PollPdfJobOptions {
  maxAttempts?: number
  intervalMs?: number
  sleep?: (ms: number) => Promise<void>
}

const defaultSleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

/**
 * Interroge `fetchStatus` jusqu'à `status === 'ready'`, jusqu'à `status ===
 * 'failed'`, ou jusqu'au dépassement de `maxAttempts * intervalMs` (20s par
 * défaut, 20 tentatives de 1s). Retourne `null` sur échec ou dépassement —
 * jamais une exception — pour que l'appelant retombe simplement sur l'aperçu HTML.
 */
export async function pollPdfJob(
  jobId: string,
  fetchStatus: (id: string) => Promise<PdfJobStatus>,
  options: PollPdfJobOptions = {}
): Promise<PdfJobStatus | null> {
  const maxAttempts = options.maxAttempts ?? 20
  const intervalMs = options.intervalMs ?? 1000
  const sleep = options.sleep ?? defaultSleep

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let job: PdfJobStatus
    try {
      job = await fetchStatus(jobId)
    } catch {
      return null
    }
    if (job.status === 'ready') return job
    if (job.status === 'failed') return null
    await sleep(intervalMs)
  }
  return null
}
