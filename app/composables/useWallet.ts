export interface WalletTransaction {
  id: string
  wallet_id: string
  amount: string
  type: string
  status: string
  gateway_ref: string | null
  payment_method: string | null
  currency: string
  refunded_at: string | null
  created_at: string
  wallet?: {
    id: string
    user_id: string
    balance_total: string
    balance_savings: string
    user?: { id: string; first_name: string | null; last_name: string | null; phone_number: string | null }
  }
}

export interface WalletTransactionsResponse {
  data: WalletTransaction[]
  total: number
  page: number
  limit: number
}

export interface PendingWithdrawal {
  id: string
  amount: string
  method: string
  phone_number: string
  status: string
  created_at: string
  user: { id: string; first_name: string | null; last_name: string | null; email: string; phone_number: string | null }
}

export interface WalletTransactionsQuery {
  page: number
  limit: number
  /** Prénom ou nom du titulaire (l'API ne cherche ni dans l'id ni dans la référence). */
  search?: string
  type?: string
  status?: string
  sortOrder?: 'ASC' | 'DESC'
}

export type ManualTransactionType = 'rent' | 'saving' | 'commission' | 'withdrawal' | 'service_fee'

/** Types acceptés par le crédit manuel (POST /wallet/transaction), dans l'ordre du formulaire. */
export const MANUAL_CREDIT_TYPES: Array<{ value: ManualTransactionType; label: string }> = [
  { value: 'saving', label: 'Épargne / recharge' },
  { value: 'rent', label: 'Loyer' },
  { value: 'commission', label: 'Commission' },
  { value: 'service_fee', label: 'Frais de service' },
  { value: 'withdrawal', label: 'Retrait' }
]

/** Motifs de refus fréquents, proposés en puces (le motif reste modifiable et obligatoire). */
export const WITHDRAWAL_REJECT_REASONS = [
  'Numéro Mobile Money incorrect ou inactif',
  "Le numéro n'est pas au nom du titulaire du compte",
  "Vérification d'identité (KYC) à compléter avant tout retrait",
  'Opération inhabituelle : vérification en cours, contactez le support'
]

/** L'API renvoie les montants signés en texte (« -16000.00 ») : un débit commence par « - ». */
export function isCreditAmount(amount: string | number): boolean {
  return !String(amount).trim().startsWith('-')
}

/** « +2290196123456 » → « +229 01 96 12 34 56 » ; tout autre format est rendu tel quel. */
export function formatMomoNumber(phone: string | null | undefined): string {
  const raw = (phone ?? '').replace(/\s/g, '')
  const m = /^(\+229)?(\d{8}|\d{10})$/.exec(raw)
  if (!m) return phone || '—'
  const pairs = m[2]!.match(/\d{2}/g)!.join(' ')
  return m[1] ? `${m[1]} ${pairs}` : pairs
}

export function withdrawalsTotal(list: Array<Pick<PendingWithdrawal, 'amount'>>): number {
  return list.reduce((sum, w) => sum + (Number(w.amount) || 0), 0)
}

/** Moyen de versement d'une demande de retrait ; la casse varie selon l'ancienneté de la demande. */
export function payoutChannelLabel(method: string | null | undefined): string {
  switch ((method ?? '').toUpperCase()) {
    case 'MTN_MOMO': return 'MTN Mobile Money'
    case 'MOOV_MONEY': return 'Moov Money'
    case 'BANK_TRANSFER': return 'Virement bancaire'
    default: return method || '—'
  }
}

/** Le numéro de retrait diffère-t-il du numéro du compte ? Comparé sur les 8 derniers chiffres (ancien et nouveau plan). */
export function payoutNumberDiffers(payout: string | null | undefined, account: string | null | undefined): boolean {
  const tail = (v: string | null | undefined) => (v ?? '').replace(/\D/g, '').slice(-8)
  return !!tail(payout) && !!tail(account) && tail(payout) !== tail(account)
}

export function useWallet() {
  const { apiFetch } = useApi()

  function fetchTransactions(query: WalletTransactionsQuery) {
    return apiFetch<WalletTransactionsResponse>('/wallet/audit/transactions', { query: { ...query } })
  }

  /** Triées par l'API de la plus ancienne à la plus récente. */
  function fetchPendingWithdrawals() {
    return apiFetch<PendingWithdrawal[]>('/wallet/withdrawals/pending')
  }

  function approveWithdrawal(id: string, transactionRef?: string) {
    return apiFetch(`/wallet/withdrawals/${id}/approve`, {
      method: 'POST',
      body: transactionRef ? { transaction_ref: transactionRef } : {}
    })
  }

  function rejectWithdrawal(id: string, reason: string) {
    return apiFetch(`/wallet/withdrawals/${id}/reject`, { method: 'POST', body: { reason } })
  }

  function creditWallet(userId: string, amount: number, type: ManualTransactionType, gatewayRef?: string) {
    return apiFetch<WalletTransaction>('/wallet/transaction', {
      method: 'POST',
      body: { userId, amount, type, gateway_ref: gatewayRef || undefined }
    })
  }

  return { fetchTransactions, fetchPendingWithdrawals, approveWithdrawal, rejectWithdrawal, creditWallet }
}
