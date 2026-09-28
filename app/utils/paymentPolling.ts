import type { TransactionStatus } from '../types/wallet'

/**
 * Sondage du statut d'une transaction de paiement (ussd_push, redirect,
 * mock). Voir 12-INTEGRATION-LOCATAIRE.md, IL4 : « le sondage ussd_push borné
 * à 30 tentatives de 4 secondes, nettoyé au démontage, tolérant aux erreurs
 * réseau ponctuelles ». Appliqué ici aux trois modes qui n'ont pas leur
 * propre callback JS (contrairement à `widget`) — voir IL4 point 2, qui
 * demande le même sondage sur `redirect`, pas seulement `ussd_push`.
 *
 * Une panne réseau ponctuelle ne fait PAS échouer le sondage : elle est
 * avalée et le sondage continue, en distinguant bien 'failed' (le serveur dit
 * explicitement que ça a échoué) de 'timeout' (on ne sait pas) — cette
 * distinction pilote le message affiché : ne jamais dire à l'utilisateur de
 * réessayer un paiement dont on ignore s'il a été débité.
 */
export type PaymentPollOutcome = 'completed' | 'failed' | 'timeout' | 'cancelled'

export interface PaymentPollResult {
  outcome: PaymentPollOutcome
  status?: TransactionStatus
}

export interface PollTransactionOptions {
  maxAttempts?: number
  intervalMs?: number
  sleep?: (ms: number) => Promise<void>
  /** Vérifié avant chaque tentative — pour arrêter proprement si le composant qui a lancé le sondage a été démonté. */
  isCancelled?: () => boolean
}

const defaultSleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

export async function pollTransactionStatus(
  transactionId: string,
  fetchStatus: (id: string) => Promise<TransactionStatus>,
  options: PollTransactionOptions = {}
): Promise<PaymentPollResult> {
  const maxAttempts = options.maxAttempts ?? 30
  const intervalMs = options.intervalMs ?? 4000
  const sleep = options.sleep ?? defaultSleep
  const isCancelled = options.isCancelled ?? (() => false)

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (isCancelled()) return { outcome: 'cancelled' }

    try {
      const status = await fetchStatus(transactionId)
      if (status.status === 'completed') return { outcome: 'completed', status }
      if (status.status === 'failed') return { outcome: 'failed', status }
      // pending / processing : on continue.
    } catch {
      // Panne réseau ponctuelle — on ne l'interprète jamais comme un échec du paiement.
    }

    await sleep(intervalMs)
  }

  return { outcome: 'timeout' }
}

export interface VerifyPollResult {
  outcome: 'completed' | 'timeout' | 'cancelled'
  amount?: number
}

/**
 * Sondage par `POST /payment/verify-return` (Lot 55). Constaté en live sur
 * Mobile Money direct (ussd_push) : `GET /payment/transactions/:id/status`
 * répond 404 sur le `transactionId` renvoyé par checkout, avant comme après
 * le paiement — et c'est verify-return qui crédite le wallet. L'ancien sondage
 * finissait donc toujours en « non confirmé » sans jamais créditer. Idempotent
 * côté API (`alreadyCredited`), donc sans risque de double crédit.
 */
export async function pollVerifyReturn(
  verify: () => Promise<{ verified: boolean; amount: number }>,
  options: PollTransactionOptions = {}
): Promise<VerifyPollResult> {
  const maxAttempts = options.maxAttempts ?? 30
  const intervalMs = options.intervalMs ?? 4000
  const sleep = options.sleep ?? defaultSleep
  const isCancelled = options.isCancelled ?? (() => false)

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (isCancelled()) return { outcome: 'cancelled' }
    try {
      const res = await verify()
      if (res.verified) return { outcome: 'completed', amount: res.amount }
    } catch {
      // Panne ponctuelle ou paiement pas encore visible côté passerelle : on continue.
    }
    await sleep(intervalMs)
  }
  return { outcome: 'timeout' }
}
