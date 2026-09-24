import type { CheckoutResult, PaymentGateway, TransactionStatus, VerifyReturnResult } from '~/types/wallet'

export interface CheckoutPayload {
  gatewayId: string
  amount: number
  description: string
  invoiceId?: string
  phoneNumber?: string
}

/**
 * Enveloppe de paiement unifiée — voir 12-INTEGRATION-LOCATAIRE.md, IL4.
 * `checkout()` renvoie un `mode` (`widget` | `redirect` | `ussd_push` |
 * `mock`) : c'est la seule chose qui doit piloter l'interface. Le champ
 * `gateway` de la réponse ne sert qu'à être retransmis à `verifyReturn()`.
 */
export function usePaymentApi() {
  const api = useApi()

  async function fetchGateways() {
    return api.get<PaymentGateway[]>('/payment/gateways')
  }

  async function checkout(payload: CheckoutPayload) {
    return api.post<CheckoutResult>('/payment/checkout', payload)
  }

  /** `transactionId` est celui renvoyé par checkout() — jamais un UUID interne de transaction wallet. */
  async function verifyReturn(transactionId: string, gatewayType: string) {
    return api.post<VerifyReturnResult>('/payment/verify-return', { transactionId, gatewayType })
  }

  async function fetchTransactionStatus(id: string) {
    return api.get<TransactionStatus>(`/payment/transactions/${id}/status`)
  }

  return { fetchGateways, checkout, verifyReturn, fetchTransactionStatus }
}
