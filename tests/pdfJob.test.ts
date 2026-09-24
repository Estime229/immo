import { describe, expect, it, vi } from 'vitest'
import { pollPdfJob, type PdfJobStatus } from '../app/utils/pdfJob'

function job(overrides: Partial<PdfJobStatus> = {}): PdfJobStatus {
  return { id: 'job-1', status: 'pending', error_message: null, download_url: null, ...overrides }
}

describe('pollPdfJob', () => {
  it('retourne le job dès que le statut passe à ready, sans attendre les tentatives restantes', async () => {
    const fetchStatus = vi.fn()
      .mockResolvedValueOnce(job({ status: 'pending' }))
      .mockResolvedValueOnce(job({ status: 'processing' }))
      .mockResolvedValueOnce(job({ status: 'ready', download_url: '/pdf-jobs/job-1/download' }))
    const sleep = vi.fn(async () => {})

    const result = await pollPdfJob('job-1', fetchStatus, { sleep })

    expect(result?.status).toBe('ready')
    expect(fetchStatus).toHaveBeenCalledTimes(3)
    expect(sleep).toHaveBeenCalledTimes(2)
  })

  it('retourne null immédiatement sur un statut failed, sans épuiser les tentatives', async () => {
    const fetchStatus = vi.fn().mockResolvedValue(job({ status: 'failed', error_message: 'boom' }))
    const sleep = vi.fn(async () => {})

    const result = await pollPdfJob('job-1', fetchStatus, { sleep })

    expect(result).toBeNull()
    expect(fetchStatus).toHaveBeenCalledTimes(1)
  })

  it('respecte la borne de tentatives — jamais un sondage infini', async () => {
    const fetchStatus = vi.fn().mockResolvedValue(job({ status: 'processing' }))
    const sleep = vi.fn(async () => {})

    const result = await pollPdfJob('job-1', fetchStatus, { maxAttempts: 5, sleep })

    expect(result).toBeNull()
    expect(fetchStatus).toHaveBeenCalledTimes(5)
    expect(sleep).toHaveBeenCalledTimes(5)
  })

  it('20 tentatives de 1s par défaut — le plafond de 20 secondes documenté dans le socle', async () => {
    const fetchStatus = vi.fn().mockResolvedValue(job({ status: 'processing' }))
    const sleep = vi.fn(async () => {})

    await pollPdfJob('job-1', fetchStatus, { sleep })

    expect(fetchStatus).toHaveBeenCalledTimes(20)
    expect(sleep).toHaveBeenCalledWith(1000)
  })

  it('une panne réseau pendant le sondage retombe sur null plutôt que de lever une exception', async () => {
    const fetchStatus = vi.fn().mockRejectedValue(new Error('network down'))
    const sleep = vi.fn(async () => {})

    await expect(pollPdfJob('job-1', fetchStatus, { sleep })).resolves.toBeNull()
  })
})
