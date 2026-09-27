import type { LeaseSummary, RentalRequestStatus, RentalRequestSummary, VisitSummary } from '../types/tenant'
import { leasePhase, noticeDepartureDate } from './leases'

export const CANDIDATURE_LABEL: Record<RentalRequestStatus, string> = { pending: 'En attente', accepted: 'Retenue', rejected: 'Non retenue' }
export const CANDIDATURE_TONE: Record<RentalRequestStatus, 'ok' | 'warn' | 'neutral'> = { pending: 'warn', accepted: 'ok', rejected: 'neutral' }

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Contrôles absents de l'API (constatés en live, Lot 51) : date invalide → 500,
 * date passée acceptée (elle devient la date de début du bail à l'acceptation).
 * La limite de 2000 caractères est celle de l'API (400 « Données invalides » sinon).
 */
export function validateCandidature(f: { moveIn: string; message: string }, todayIso: string): string | null {
  if (f.moveIn) {
    if (!ISO_DATE.test(f.moveIn) || Number.isNaN(new Date(f.moveIn).getTime())) return "La date d'emménagement est invalide."
    if (f.moveIn < todayIso) return "La date d'emménagement est déjà passée."
  }
  if (f.message.trim().length > 2000) return 'Le message ne peut pas dépasser 2000 caractères.'
  return null
}

/**
 * Ce que l'API prépare en acceptant (`AcceptRentalRequestHandler`) :
 * loyer = prix affiché, caution = `caution_months` (2 par défaut, plafond 3),
 * avance = `avance_months` (plafond 3). Le prépayé du logement est ignoré ici,
 * contrairement à la création directe d'un bail (#68).
 */
export function acceptancePreview(unit: NonNullable<RentalRequestSummary['unit']>) {
  const rent = Number(unit.price) || 0
  const depositMonths = Math.min(unit.caution_months ?? 2, 3)
  const advanceMonths = Math.min(unit.avance_months ?? 0, 3)
  return {
    rent,
    depositMonths,
    deposit: rent * depositMonths,
    advanceMonths,
    advance: rent * advanceMonths,
    prepaidIgnored: (unit.prepaye_months ?? 0) > 0
  }
}

/** Date de début que prendra le bail : la date souhaitée, sinon le jour de l'acceptation. */
export function leaseStartIfAccepted(r: Pick<RentalRequestSummary, 'desired_move_in_at'>, todayIso: string): { date: string; past: boolean } {
  const date = r.desired_move_in_at?.slice(0, 10) || todayIso
  return { date, past: date < todayIso }
}

type LeaseForConflict = Pick<LeaseSummary, 'status' | 'unit' | 'renewal_intent' | 'renewal_intent_date' | 'notice_period' | 'entry_paid_at'> & { unit_id?: string | null }

/**
 * Bail en cours ou en préparation sur ce logement : l'API accepte quand même
 * la candidature et crée un second bail qui chevauche le premier (#67).
 * Exception légitime : un bail en préavis dont le départ tombe au plus tard à
 * la date de début du nouveau.
 */
export function conflictingLease<T extends LeaseForConflict>(leases: T[], unitId: string, startIso?: string): T | null {
  return leases.find(l => {
    if ((l.unit_id ?? l.unit?.id) !== unitId) return false
    const phase = leasePhase(l)
    if (phase === 'terminated' || phase === 'cancelled_unpaid') return false
    if (phase === 'notice' && startIso) {
      const departure = noticeDepartureDate(l)
      if (departure && departure <= startIso) return false
    }
    return true
  }) ?? null
}

/** Brouillon créé par l'acceptation (l'API ne renvoie pas son id) : le plus récent pour ce locataire et ce logement. */
export function draftLeaseFor<T extends Pick<LeaseSummary, 'status' | 'unit' | 'tenant'> & { unit_id?: string | null; tenant_id?: string; created_at?: string }>(leases: T[], unitId: string, tenantId: string): T | null {
  return leases
    .filter(l => (l.unit_id ?? l.unit?.id) === unitId && (l.tenant_id ?? l.tenant.id) === tenantId && l.status !== 'terminated')
    .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))[0] ?? null
}

/** Candidatures regroupées par logement, les logements qui ont des candidats en attente d'abord. */
export function groupByUnit(requests: RentalRequestSummary[]): { unitId: string; unit: RentalRequestSummary['unit']; requests: RentalRequestSummary[]; pending: number }[] {
  const groups = new Map<string, { unitId: string; unit: RentalRequestSummary['unit']; requests: RentalRequestSummary[]; pending: number }>()
  for (const r of requests) {
    const g = groups.get(r.unit_id) ?? { unitId: r.unit_id, unit: r.unit, requests: [], pending: 0 }
    g.requests.push(r)
    if (r.status === 'pending') g.pending++
    groups.set(r.unit_id, g)
  }
  return [...groups.values()]
    .map(g => ({ ...g, requests: [...g.requests].sort((a, b) => (a.status === 'pending' ? 0 : 1) - (b.status === 'pending' ? 0 : 1) || a.created_at.localeCompare(b.created_at)) }))
    .sort((a, b) => b.pending - a.pending)
}

/** Dernière candidature du locataire sur un logement (il peut repostuler après un refus). */
export function latestRequestFor(requests: RentalRequestSummary[], unitId: string): RentalRequestSummary | null {
  return requests.filter(r => r.unit_id === unitId).sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null
}

/** Visite la plus pertinente de ce candidat pour ce logement (réalisée > confirmée > demandée). */
export function visitOf(visits: VisitSummary[], tenantId: string, unitId: string): VisitSummary | null {
  const rank: Record<string, number> = { completed: 0, confirmed: 1, pending: 2 }
  return visits
    .filter(v => v.tenant_id === tenantId && v.unit_id === unitId && v.status in rank)
    .sort((a, b) => rank[a.status]! - rank[b.status]!)[0] ?? null
}
