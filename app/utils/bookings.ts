import { deriveHoldCountdown } from './bookingHold'

type BookingLike = { status: 'pending_payment' | 'confirmed' | 'cancelled'; check_in: string; check_out: string; expires_at?: string | null }

/**
 * Phase d'un séjour — l'API n'a que trois statuts (`pending_payment`,
 * `confirmed`, `cancelled`) : un séjour terminé reste « confirmée » pour
 * toujours, et un hold expiré devient « annulée » comme une vraie annulation.
 * Dates comparées au jour près (`check_in`/`check_out` sont des dates sans heure).
 */
export type BookingPhase = 'hold' | 'hold_expired' | 'upcoming' | 'ongoing' | 'past' | 'cancelled'

function localIso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function bookingPhase(b: BookingLike, now: Date = new Date()): BookingPhase {
  if (b.status === 'cancelled') return 'cancelled'
  if (b.status === 'pending_payment') return deriveHoldCountdown(b.expires_at ?? null, now)?.expired ? 'hold_expired' : 'hold'
  const today = localIso(now)
  if (b.check_in.slice(0, 10) > today) return 'upcoming'
  if (b.check_out.slice(0, 10) > today) return 'ongoing'
  return 'past'
}

export const PHASE_LABEL: Record<BookingPhase, string> = {
  hold: 'À payer',
  hold_expired: 'Délai de paiement dépassé',
  upcoming: 'Confirmée',
  ongoing: 'Séjour en cours',
  past: 'Séjour terminé',
  cancelled: 'Annulée ou expirée'
}

export const PHASE_TONE: Record<BookingPhase, 'ok' | 'warn' | 'danger' | 'neutral'> = {
  hold: 'warn',
  hold_expired: 'neutral',
  upcoming: 'ok',
  ongoing: 'ok',
  past: 'neutral',
  cancelled: 'neutral'
}

/** Prolonger n'a de sens que pour un séjour confirmé pas encore terminé. */
export function canExtend(b: BookingLike, now: Date = new Date()): boolean {
  const p = bookingPhase(b, now)
  return p === 'upcoming' || p === 'ongoing'
}

/**
 * Première date de départ possible pour une prolongation : l'API applique le
 * séjour minimum du logement **au segment ajouté seul** (constaté en live :
 * +1 nuit refusée avec « Séjour minimum : 2 nuit(s) » sur un logement à 2 nuits min.).
 */
export function minExtensionCheckOut(checkOut: string, minStayDays?: number | null): string {
  const d = new Date(`${checkOut.slice(0, 10)}T12:00:00`)
  d.setDate(d.getDate() + Math.max(1, minStayDays ?? 1))
  return localIso(d)
}

/**
 * Ce que l'hôte a réellement perçu : total − réduction − récompense parrain,
 * dont une part retenue jusqu'au départ (`retained_amount`). Vérifié en live :
 * 30 000 − 3 000 (−10 %) = 27 000, dont 21 600 crédités et 5 400 retenus (20 %).
 */
export function hostAmounts(b: { total_price: string; discount_amount?: string | null; reward_amount?: string | null; retained_amount?: string | null; retention_released_at?: string | null }) {
  const paid = Number(b.total_price) - Number(b.discount_amount ?? 0)
  const net = paid - Number(b.reward_amount ?? 0)
  const retained = Number(b.retained_amount ?? 0)
  const released = !!b.retention_released_at
  return { paid, net, retained, received: released ? net : net - retained, released }
}
