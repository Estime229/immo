import type { SignalStatus, SignalSummary, SignalType } from '../types/tenant'

/**
 * Règles des signalements (Lot 55), relevées en live sur l'API — le Swagger
 * ne décrit que « 400 si la transition est invalide ».
 *
 * Propriétaire : open → in_review | closed | cancelled ; in_review → open |
 * resolved ; resolved → open | closed ; closed et cancelled sont finaux.
 * Refusés : open → resolved, in_review → closed, in_review → cancelled.
 * Auteur (locataire) : seulement open → cancelled (403 pour tout autre statut).
 */
export const SIGNAL_STATUS_LABEL: Record<SignalStatus, string> = {
  open: 'Ouvert',
  in_review: 'Pris en charge',
  resolved: 'Résolu',
  closed: 'Clôturé',
  cancelled: 'Annulé'
}

export const SIGNAL_STATUS_TONE: Record<SignalStatus, 'warn' | 'info' | 'ok' | 'neutral'> = {
  open: 'warn',
  in_review: 'info',
  resolved: 'ok',
  closed: 'neutral',
  cancelled: 'neutral'
}

export interface LandlordSignalAction {
  to: SignalStatus
  label: string
  /** « Marquer résolu » ouvre d'abord la note de résolution transmise au locataire. */
  needsNote?: boolean
  tone: 'primary' | 'secondary'
}

/** Avant : l'écran proposait in_review → closed (refusé par l'API) et ne permettait ni de rouvrir ni de revenir en attente. */
export function landlordActions(status: SignalStatus): LandlordSignalAction[] {
  switch (status) {
    case 'open': return [
      { to: 'in_review', label: 'Prendre en charge', tone: 'primary' },
      { to: 'closed', label: 'Clore sans suite', tone: 'secondary' }
    ]
    case 'in_review': return [
      { to: 'resolved', label: 'Marquer résolu', needsNote: true, tone: 'primary' },
      { to: 'open', label: 'Remettre en attente', tone: 'secondary' }
    ]
    case 'resolved': return [
      { to: 'closed', label: 'Clôturer', tone: 'primary' },
      { to: 'open', label: 'Rouvrir', tone: 'secondary' }
    ]
    default: return []
  }
}

export function canTenantCancel(s: Pick<SignalSummary, 'status'>): boolean {
  return s.status === 'open'
}

/** Photos ajoutables tant que le signalement est suivi. */
export function canAddAttachments(s: Pick<SignalSummary, 'status'>): boolean {
  return s.status === 'open' || s.status === 'in_review'
}

export function isActiveSignal(s: Pick<SignalSummary, 'status'>): boolean {
  return s.status === 'open' || s.status === 'in_review' || s.status === 'resolved'
}

/** Suivi côté locataire : 4 étapes calquées sur les statuts réels (l'ancienne étape « Intervention » n'existait pas côté API). */
export const TENANT_STEPS = ['Déclaré', 'Pris en charge', 'Résolu', 'Clôturé'] as const
export function tenantStep(status: SignalStatus): number {
  return { open: 1, in_review: 2, resolved: 3, closed: 4, cancelled: 0 }[status]
}

/** Signalements en cours d'abord, puis du plus récent au plus ancien. */
export function sortSignals<T extends Pick<SignalSummary, 'status' | 'created_at'>>(list: T[]): T[] {
  return [...list].sort((a, b) => Number(isActiveSignal(b)) - Number(isActiveSignal(a)) || b.created_at.localeCompare(a.created_at))
}

export function signalPlace(s: Pick<SignalSummary, 'unit' | 'property'>, fallback = 'Logement'): string {
  const unit = s.unit?.name
  const property = s.property?.name
  if (unit && property) return `${unit} — ${property}`
  return unit ?? property ?? fallback
}

export function signalAuthor(s: Pick<SignalSummary, 'author'>): string {
  const a = s.author
  if (!a) return ''
  return `${a.first_name ?? ''} ${a.last_name ?? ''}`.trim() || a.email || ''
}

/** « Transition impossible : cancelled → resolved » : le signalement a changé entre-temps (autre onglet, locataire qui annule). */
export function isStaleTransition(message: string | null | undefined): boolean {
  return !!message && message.startsWith('Transition impossible')
}

export const SIGNAL_TYPE_LABEL: Record<SignalType, string> = {
  maintenance_plomberie: 'Plomberie',
  maintenance_electricite: 'Électricité',
  maintenance_serrurerie: 'Serrurerie',
  maintenance_peinture: 'Peinture / murs',
  maintenance_autre: 'Équipement',
  dispute_landlord: 'Différend avec le propriétaire',
  dispute_neighbor: 'Voisinage',
  nuisance_sonore: 'Nuisance sonore',
  insalubrite: 'Insalubrité',
  infrastructure_commune: 'Parties communes',
  tenant_leaving: 'Départ du locataire',
  renewal_request: 'Renouvellement',
  autre: 'Autre'
}

/** Seul un bail actif ouvre le droit de signaler (l'API ne vérifie rien, #87 : on ne propose que le logement réellement occupé). */
export function reportableLeases<T extends { status: string }>(leases: T[]): T[] {
  return leases.filter(l => l.status === 'active')
}
