import type { VisitStatus, VisitSummary } from '../types/tenant'

/**
 * Date qui fait foi : l'horaire confirmé ou replanifié par le propriétaire
 * (`confirmed_at`) s'il existe, sinon celui demandé. Jusqu'au Lot 48 les deux
 * espaces affichaient toujours `requested_at` : après une replanification, le
 * locataire voyait l'ancien jour.
 */
export function visitDate(v: Pick<VisitSummary, 'requested_at' | 'confirmed_at'>): string {
  return v.confirmed_at ?? v.requested_at
}

/** L'horaire a été changé par le propriétaire (confirmation à une autre heure ou replanification). */
export function visitMoved(v: Pick<VisitSummary, 'requested_at' | 'confirmed_at'>): boolean {
  return !!v.confirmed_at && new Date(v.confirmed_at).getTime() !== new Date(v.requested_at).getTime()
}

export type VisitBucket = 'todo' | 'upcoming' | 'to_close' | 'history'

/**
 * - `todo` : en attente d'une réponse du propriétaire, date à venir ;
 * - `upcoming` : confirmée, date à venir ;
 * - `to_close` : confirmée mais passée (à marquer réalisée) ;
 * - `history` : refusée, annulée, réalisée — ou demande restée sans réponse et dépassée
 *   (l'API ne fait jamais expirer une visite en attente).
 */
export function visitBucket(v: Pick<VisitSummary, 'status' | 'requested_at' | 'confirmed_at'>, now: Date = new Date()): VisitBucket {
  const future = new Date(visitDate(v)).getTime() > now.getTime()
  if (v.status === 'pending') return future ? 'todo' : 'history'
  if (v.status === 'confirmed') return future ? 'upcoming' : 'to_close'
  return 'history'
}

/** Une demande restée en attente au-delà de sa date. */
export function visitExpired(v: Pick<VisitSummary, 'status' | 'requested_at' | 'confirmed_at'>, now: Date = new Date()): boolean {
  return v.status === 'pending' && new Date(visitDate(v)).getTime() <= now.getTime()
}

/** « Réalisée » seulement une fois l'horaire passé — l'API l'accepte 8 jours avant (constaté en live). */
export function canComplete(v: Pick<VisitSummary, 'status' | 'requested_at' | 'confirmed_at'>, now: Date = new Date()): boolean {
  return v.status === 'confirmed' && new Date(visitDate(v)).getTime() <= now.getTime()
}

export const VISIT_HOURS = { first: 7, last: 20 }

/** Créneaux proposés (toutes les 30 min, 7h–20h) : l'API accepte n'importe quelle heure, y compris 3h du matin. */
export function visitTimeSlots(): string[] {
  const out: string[] = []
  for (let h = VISIT_HOURS.first; h <= VISIT_HOURS.last; h++) {
    out.push(`${String(h).padStart(2, '0')}:00`)
    if (h < VISIT_HOURS.last) out.push(`${String(h).padStart(2, '0')}:30`)
  }
  return out
}

/**
 * Contrôle d'un créneau saisi (date locale `YYYY-MM-DD` + heure `HH:MM`) :
 * au moins 2 h à l'avance, dans la plage 7h–20h. L'API ne vérifie que
 * « dans le futur » pour une demande, et **rien** pour une confirmation
 * (une date de 2025 a été acceptée en live).
 */
export function validateVisitSlot(date: string, time: string, now: Date = new Date()): string | null {
  if (!date || !time) return 'Choisissez une date et une heure.'
  const [h, m] = time.split(':').map(Number)
  if (h === undefined || m === undefined || h < VISIT_HOURS.first || h > VISIT_HOURS.last || (h === VISIT_HOURS.last && m > 0)) {
    return `Choisissez un horaire entre ${VISIT_HOURS.first} h et ${VISIT_HOURS.last} h.`
  }
  const when = new Date(`${date}T${time}:00`)
  if (Number.isNaN(when.getTime())) return 'Date invalide.'
  if (when.getTime() < now.getTime() + 2 * 3600000) return 'Choisissez un créneau au moins 2 heures à l\'avance.'
  return null
}

/** Statut attendu après chaque action — sert à vérifier l'état réel quand l'API répond 500 alors que l'action a eu lieu. */
export const EXPECTED_STATUS: Record<'confirm' | 'reject' | 'cancel' | 'complete' | 'reschedule', VisitStatus> = {
  confirm: 'confirmed',
  reject: 'rejected',
  cancel: 'cancelled',
  complete: 'completed',
  reschedule: 'confirmed'
}
