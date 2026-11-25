import type { PaymentGateway, WithdrawalRequest } from '../types/wallet'

/**
 * Règles du wallet côté écran (Lot 55). Les deux soldes viennent de
 * GET /wallet/me ; la tirelire est censée être une partie du total, mais
 * l'API la laisse dépasser le total (#82) : un paiement de loyer, d'entrée ou
 * de réservation ne vérifie que la tirelire et peut rendre le total négatif.
 */

/** Ce qu'un paiement de logement peut réellement prélever : la tirelire, plafonnée au total (jamais négatif). */
export function spendableSavings(total: number, savings: number): number {
  return Math.max(0, Math.min(savings, total))
}

/** Tirelire au-dessus du total, ou total négatif : les chiffres de l'API ne tiennent plus ensemble. */
export function walletInconsistent(total: number, savings: number): boolean {
  return total < 0 || savings > total
}

/**
 * Montant du wallet tel que l'API le renvoie (« 125000.00 », parfois un nombre,
 * parfois absent) → nombre. Additionner deux chaînes brutes donnerait
 * « 125000.0095000.00 » : tout calcul passe par ici, et une valeur illisible
 * vaut 0 plutôt que NaN à l'écran.
 */
export function walletAmount(value: string | number | null | undefined): number {
  const n = typeof value === 'number' ? value : Number(String(value ?? '').trim() || 0)
  return Number.isFinite(n) ? n : 0
}

export interface WalletBreakdown {
  /** Le solde unique affiché : ce que le wallet contient réellement. */
  total: number
  /** Part réservée au logement (loyers, réservations, entrée) : la tirelire, plafonnée au total. */
  reserved: number
  /** Le reste, qu'aucun paiement de logement n'attend. */
  free: number
}

/**
 * Un seul solde à l'écran, et sa répartition (décision produit : plus de
 * deux cartes « Solde disponible » / « Tirelire » qui se lisaient comme deux
 * poches à additionner).
 *
 * Le total est `balance_total` seul, pas `balance_total + balance_savings` :
 * côté API la tirelire est une PARTIE du total — une recharge crédite les deux
 * du même montant, un paiement de logement débite les deux, un retrait
 * plafonne la tirelire au nouveau total (`wallet-debit.helper.ts`,
 * `record-transaction.handler.ts`, `withdrawal.service.ts`). Les additionner
 * compterait deux fois chaque recharge.
 */
export function walletBreakdown(balanceTotal: string | number | null | undefined, balanceSavings: string | number | null | undefined): WalletBreakdown {
  const total = walletAmount(balanceTotal)
  const reserved = spendableSavings(total, walletAmount(balanceSavings))
  return { total, reserved, free: Math.max(0, total - reserved) }
}

/**
 * Ligne affichée sous le solde. Vide pour un solde nul ou négatif (l'encart
 * d'incohérence prend alors le relais) ; formulée sans « 0 F » quand l'une
 * des deux parts est vide. `fmt` : le formateur monétaire de l'écran.
 */
export function walletBreakdownLine(b: WalletBreakdown, fmt: (n: number) => string): string {
  if (b.total <= 0) return ''
  if (b.reserved <= 0) return 'aucune part réservée au logement (loyers et réservations) pour l\'instant'
  if (b.free <= 0) return 'entièrement réservés au logement (loyers et réservations)'
  return `dont ${fmt(b.reserved)} réservés au logement (loyers et réservations) · ${fmt(b.free)} libres`
}

/**
 * Badge de statut d'un mouvement de l'historique : seulement quand il
 * apprend quelque chose. Un mouvement terminé est le cas normal — répéter
 * « Terminé » sur chaque ligne coupait les libellés sur mobile.
 * Casse ignorée (l'API mélange minuscules et majuscules selon les routes) ;
 * un statut inconnu reste signalé plutôt que masqué.
 */
export function transactionStatusBadge(status: string | null | undefined): { label: string; tone: 'warn' | 'danger' | 'neutral' } | null {
  switch ((status ?? '').toLowerCase()) {
    case 'completed': return null
    case 'pending': return { label: 'En attente', tone: 'warn' }
    case 'processing': return { label: 'En cours', tone: 'warn' }
    case 'failed': return { label: 'Échoué', tone: 'danger' }
    case 'cancelled':
    case 'canceled': return { label: 'Annulé', tone: 'neutral' }
    case 'refunded': return { label: 'Remboursé', tone: 'neutral' }
    default: return { label: 'Statut inconnu', tone: 'neutral' }
  }
}

/** L'API renvoie la méthode en minuscules (`mtn_momo`) alors que l'enum déclarée est en majuscules. */
export function withdrawalMethodLabel(method: string | null | undefined): string {
  switch ((method ?? '').toUpperCase()) {
    case 'MTN_MOMO': return 'MTN'
    case 'MOOV_MONEY': return 'Moov'
    case 'BANK_TRANSFER': return 'Virement bancaire'
    default: return method || '—'
  }
}

/** Une seule demande en attente à la fois (règle de l'API) — la plus récente si l'API en renvoyait plusieurs. */
export function pendingWithdrawal(list: WithdrawalRequest[]): WithdrawalRequest | null {
  return [...list].filter(w => w.status === 'pending').sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null
}

/**
 * Numéro Mobile Money béninois : 8 chiffres (ancien plan) ou 10 chiffres
 * commençant par 01 (plan de 2024), avec ou sans +229. L'API accepte
 * n'importe quelle chaîne (« abc » compris, #84) : le contrôle est ici.
 */
export function normalizeBeninPhone(raw: string): string | null {
  const digits = raw.replace(/[\s.\-()]/g, '')
  const m = /^(?:\+?229|00229)?(01\d{8}|\d{8})$/.exec(digits)
  return m ? `+229${m[1]}` : null
}

export const WITHDRAW_MIN = 500
export const RECHARGE_MIN = 500

export function validateWithdrawal(input: { amount: number; phone: string; balance: number; pending: WithdrawalRequest | null }): string | null {
  if (input.pending) return `Une demande de ${Number(input.pending.amount).toLocaleString('fr-FR')} F est déjà en attente : attendez son traitement avant d'en faire une autre.`
  if (!input.amount) return 'Indiquez un montant.'
  if (input.amount < WITHDRAW_MIN) return `Le montant minimum est de ${WITHDRAW_MIN} FCFA.`
  if (input.amount > input.balance) return 'Ce montant dépasse votre solde disponible.'
  if (!input.phone.trim()) return 'Indiquez le numéro Mobile Money qui recevra les fonds.'
  if (!normalizeBeninPhone(input.phone)) return 'Numéro invalide : 8 chiffres, ou 10 chiffres commençant par 01 (ex. 01 97 00 00 00).'
  return null
}

/** Passerelles Mobile Money directes : la demande part sur le téléphone saisi, qu'il faut donc demander. */
export function gatewayNeedsPhone(g: Pick<PaymentGateway, 'type'>): boolean {
  return g.type.toUpperCase().startsWith('GSM_')
}

/** Kkiapay passe par un widget JS tiers que l'application ne charge pas : le proposer menait à une erreur après coup. */
export function gatewaySupported(g: Pick<PaymentGateway, 'type'>): boolean {
  return g.type.toUpperCase() !== 'KKIAPYA'
}

export function validateRecharge(input: { amount: number; gateway: Pick<PaymentGateway, 'type'> | null; phone: string }): string | null {
  if (!input.amount) return 'Indiquez un montant.'
  if (input.amount < RECHARGE_MIN) return `Le montant minimum est de ${RECHARGE_MIN} FCFA.`
  if (!input.gateway) return 'Choisissez un moyen de paiement.'
  if (gatewayNeedsPhone(input.gateway) && !normalizeBeninPhone(input.phone)) return 'Indiquez le numéro Mobile Money à débiter : 8 chiffres, ou 10 chiffres commençant par 01.'
  return null
}
