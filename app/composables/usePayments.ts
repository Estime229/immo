export interface TransactionStatus {
  id: string
  amount: number
  type: string
  status: string
  gateway_ref: string | null
  created_at: string
}

export interface RefundResult {
  id: string
  original_transaction_id: string
  amount: number
  status: string
}

export interface RetryWebhooksResult {
  retried: number
  succeeded: number
}

/** Motifs de remboursement fréquents, proposés en puces (le motif reste modifiable et obligatoire). */
export const REFUND_REASONS = [
  'Paiement en double',
  'Réservation ou bail annulé',
  'Montant prélevé par erreur',
  'Litige tranché en faveur du payeur'
]

/** Phrase de résultat de la relance des webhooks, sans « (s) ». */
export function retryWebhooksSummary(res: RetryWebhooksResult): string {
  if (!res.retried) return 'Aucun webhook en échec : rien à relancer.'
  const failed = Math.max(0, res.retried - res.succeeded)
  const relances = `${res.retried} webhook${res.retried > 1 ? 's' : ''} relancé${res.retried > 1 ? 's' : ''}`
  const ok = `${res.succeeded} abouti${res.succeeded > 1 ? 's' : ''}`
  return failed ? `${relances} : ${ok}, ${failed} encore en échec.` : `${relances} : ${ok}.`
}

export function usePayments() {
  const { apiFetch } = useApi()

  /** `id` : UUID interne ou référence passerelle. L'API ne cherche que dans le wallet du compte connecté. */
  function fetchTransactionStatus(id: string) {
    return apiFetch<TransactionStatus>(`/payment/transactions/${encodeURIComponent(id)}/status`)
  }

  function refundTransaction(transactionId: string, amount?: number, reason?: string) {
    return apiFetch<RefundResult>('/payment/refund', {
      method: 'POST',
      body: { transactionId, amount, reason }
    })
  }

  function retryFailedWebhooks() {
    return apiFetch<RetryWebhooksResult>('/payment/retry-webhooks', { method: 'POST' })
  }

  return { fetchTransactionStatus, refundTransaction, retryFailedWebhooks }
}
