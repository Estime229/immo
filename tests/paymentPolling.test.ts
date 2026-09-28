import { describe, expect, it, vi } from 'vitest'
import { pollTransactionStatus, pollVerifyReturn } from '../app/utils/paymentPolling'
import type { TransactionStatus } from '../app/types/wallet'

function status(overrides: Partial<TransactionStatus> = {}): TransactionStatus {
  return { id: 'tx-1', amount: 75000, type: 'saving', status: 'pending', gateway_ref: null, created_at: '2026-09-17T10:00:00.000Z', ...overrides }
}

describe('pollTransactionStatus', () => {
  it('retourne completed dès que le statut y passe', async () => {
    const fetchStatus = vi.fn()
      .mockResolvedValueOnce(status({ status: 'pending' }))
      .mockResolvedValueOnce(status({ status: 'completed' }))
    const sleep = vi.fn(async () => {})

    const result = await pollTransactionStatus('tx-1', fetchStatus, { sleep })

    expect(result.outcome).toBe('completed')
    expect(fetchStatus).toHaveBeenCalledTimes(2)
  })

  it('distingue failed (le serveur le dit) de timeout (on ne sait pas)', async () => {
    const fetchStatus = vi.fn().mockResolvedValue(status({ status: 'failed' }))
    const sleep = vi.fn(async () => {})
    const result = await pollTransactionStatus('tx-1', fetchStatus, { sleep })
    expect(result.outcome).toBe('failed')
  })

  it('une panne réseau ponctuelle ne fait pas échouer le sondage — il continue', async () => {
    const fetchStatus = vi.fn()
      .mockRejectedValueOnce(new Error('network blip'))
      .mockRejectedValueOnce(new Error('network blip'))
      .mockResolvedValueOnce(status({ status: 'completed' }))
    const sleep = vi.fn(async () => {})

    const result = await pollTransactionStatus('tx-1', fetchStatus, { sleep })

    expect(result.outcome).toBe('completed')
    expect(fetchStatus).toHaveBeenCalledTimes(3)
  })

  it('30 tentatives de 4s par défaut — le plafond documenté pour ussd_push', async () => {
    const fetchStatus = vi.fn().mockResolvedValue(status({ status: 'processing' }))
    const sleep = vi.fn(async () => {})

    const result = await pollTransactionStatus('tx-1', fetchStatus, { sleep })

    expect(result.outcome).toBe('timeout')
    expect(fetchStatus).toHaveBeenCalledTimes(30)
    expect(sleep).toHaveBeenCalledWith(4000)
  })

  it('s\'arrête proprement si isCancelled devient vrai — nettoyage au démontage', async () => {
    let cancelled = false
    const fetchStatus = vi.fn().mockResolvedValue(status({ status: 'pending' }))
    const sleep = vi.fn(async () => { cancelled = true })

    const result = await pollTransactionStatus('tx-1', fetchStatus, { sleep, isCancelled: () => cancelled, maxAttempts: 10 })

    expect(result.outcome).toBe('cancelled')
    expect(fetchStatus).toHaveBeenCalledTimes(1)
  })
})

describe('pollVerifyReturn (Lot 55 : seul verify-return confirme et crédite un ussd_push)', () => {
  it('s\'arrête dès que le paiement est vérifié', async () => {
    const verify = vi.fn()
      .mockResolvedValueOnce({ verified: false, amount: 0 })
      .mockRejectedValueOnce(new Error('réseau'))
      .mockResolvedValueOnce({ verified: true, amount: 5000 })
    const result = await pollVerifyReturn(verify, { sleep: async () => {} })
    expect(result).toEqual({ outcome: 'completed', amount: 5000 })
    expect(verify).toHaveBeenCalledTimes(3)
  })
  it('finit en timeout sans jamais conclure à un échec', async () => {
    const verify = vi.fn().mockResolvedValue({ verified: false, amount: 0 })
    const result = await pollVerifyReturn(verify, { sleep: async () => {}, maxAttempts: 3 })
    expect(result.outcome).toBe('timeout')
    expect(verify).toHaveBeenCalledTimes(3)
  })
  it('s\'arrête si la modale est fermée', async () => {
    const verify = vi.fn().mockResolvedValue({ verified: false, amount: 0 })
    let calls = 0
    const result = await pollVerifyReturn(verify, { sleep: async () => {}, isCancelled: () => ++calls > 1 })
    expect(result.outcome).toBe('cancelled')
    expect(verify).toHaveBeenCalledTimes(1)
  })
})
