import type { PayRentResult, WalletStats, WalletSummary, WalletTransactionsPage, WithdrawalMethod, WithdrawalRequest } from '~/types/wallet'

export function useWalletApi() {
  const api = useApi()

  async function fetchMe() {
    return api.get<WalletSummary>('/wallet/me')
  }

  async function fetchStats() {
    return api.get<WalletStats>('/wallet/stats')
  }

  async function fetchTransactions(page = 1, limit = 50) {
    return api.get<WalletTransactionsPage>('/wallet/transactions', { page, limit })
  }

  /** Règle une facture de loyer directement depuis la tirelire (balance_savings) — pas de passerelle, pas de sondage. */
  async function payRent(invoiceId: string, leaseId: string) {
    return api.post<PayRentResult>('/wallet/pay-rent', { invoiceId, leaseId })
  }

  /** Un admin doit approuver avant traitement — min 500 FCFA, une seule demande en attente à la fois (vérifié : messages d'erreur réels). */
  async function requestWithdrawal(amount: number, phoneNumber: string, method: WithdrawalMethod = 'MTN_MOMO') {
    return api.post<WithdrawalRequest>('/wallet/withdraw', { amount, phone_number: phoneNumber, method })
  }

  async function fetchWithdrawals() {
    return api.get<WithdrawalRequest[]>('/wallet/withdrawals/my')
  }

  return { fetchMe, fetchStats, fetchTransactions, payRent, requestWithdrawal, fetchWithdrawals }
}
