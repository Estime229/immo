/**
 * Wallet et paiements — voir 12-INTEGRATION-LOCATAIRE.md, IL4. Écrits à la
 * main à partir des exemples du Swagger live (réponses non typées en
 * `properties`), vérifiés le 2026-09-17.
 */

/** Montants en chaînes ("125000.00") — ne convertir qu'à l'affichage (socle §1). */
export interface WalletSummary {
  id: string
  user_id: string
  balance_total: string
  balance_savings: string
  created_at: string
}

export interface WalletMonthStat {
  month: string
  income: number
  expenses: number
}

/** Ici les montants sont des nombres, pas des chaînes — contrairement à /wallet/me. Vérifié, pas supposé. */
export interface WalletStats {
  balance_total: number
  balance_savings: number
  total_income: number
  total_expenses: number
  pending_amount: number
  monthly_history: WalletMonthStat[]
}

/**
 * Cinq valeurs formellement déclarées dans le schéma Swagger (`rent`,
 * `saving`, `commission`, `withdrawal`, `service_fee`) — mais la doc
 * d'intégration signale trois valeurs réelles supplémentaires absentes de ce
 * schéma (`lease_entry_payment`, `short_stay_booking_payment`,
 * `artisan_intervention_payment`), donc traité en chaîne libre plutôt qu'en
 * union stricte : un type strict donnerait une fausse impression de couverture.
 */
export interface WalletTransaction {
  id: string
  amount: string
  type: string
  status: string
  gateway_ref: string | null
  created_at: string
}

export interface WalletTransactionsPage {
  data: WalletTransaction[]
  total: number
  page: number
  limit: number
}

export interface PayRentResult {
  success: boolean
  transaction_id: string
}

export type WithdrawalMethod = 'MTN_MOMO' | 'MOOV_MONEY' | 'BANK_TRANSFER'
/** 3 valeurs réelles (pending/processed/rejected) — le libellé « Approuvée » de la maquette n'a pas d'équivalent serveur distinct. */
export type WithdrawalStatus = 'pending' | 'processed' | 'rejected'

export interface WithdrawalRequest {
  id: string
  amount: string
  method: WithdrawalMethod
  phone_number: string
  status: WithdrawalStatus
  transaction_ref?: string | null
  rejection_reason?: string | null
  created_at: string
}

export interface PaymentGateway {
  id: string
  name: string
  type: string
  isTestMode: boolean
}

export type CheckoutMode = 'widget' | 'redirect' | 'ussd_push' | 'mock'

export interface CheckoutInstructions {
  fr: string
  en?: string
}

interface CheckoutResultBase {
  /**
   * Présent dans la réponse mais jamais lu pour décider du comportement —
   * seul `mode` pilote l'interface (voir IL4 : « le front ne doit jamais lire
   * le champ gateway »). Conservé uniquement pour le transmettre tel quel à
   * `verify-return`.
   */
  gateway: string
  transactionId: string
  /** À lire pour savoir si on est en bac à sable — jamais déduit du mode (voir IL4, mode 'mock'). */
  sandbox: boolean
  instructions: CheckoutInstructions
}

export interface CheckoutRedirectResult extends CheckoutResultBase {
  mode: 'redirect'
  url: string
}
export interface CheckoutWidgetResult extends CheckoutResultBase {
  mode: 'widget'
  widget: { key: string; amount: number; description: string; sandbox: boolean; data: string }
}
export interface CheckoutUssdResult extends CheckoutResultBase {
  mode: 'ussd_push'
}
export interface CheckoutMockResult extends CheckoutResultBase {
  mode: 'mock'
}
export type CheckoutResult = CheckoutRedirectResult | CheckoutWidgetResult | CheckoutUssdResult | CheckoutMockResult

export interface VerifyReturnResult {
  verified: boolean
  amount: number
  alreadyCredited: boolean
}

export interface TransactionStatus {
  id: string
  amount: number
  type: string
  status: string
  gateway_ref: string | null
  created_at: string
}
