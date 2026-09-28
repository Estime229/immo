import type { ArtisanOffer, ArtisanRequestSummary } from '../types/artisan'

/**
 * Phase réelle d'une intervention (Lot 54). L'API a six statuts ; un litige
 * laisse la demande `completed` avec `disputed_at` renseigné, et `closed`
 * n'était géré nulle part côté front (la mission disparaissait).
 */
export type InterventionPhase = 'open' | 'agreed' | 'in_progress' | 'warranty' | 'disputed' | 'closed' | 'cancelled'

export function interventionPhase(r: Pick<ArtisanRequestSummary, 'status' | 'disputed_at'>): InterventionPhase {
  if (r.status === 'completed') return r.disputed_at ? 'disputed' : 'warranty'
  if (r.status === 'closed' || r.status === 'cancelled' || r.status === 'open' || r.status === 'agreed' || r.status === 'in_progress') return r.status as InterventionPhase
  return 'open'
}

export const PHASE_LABEL_REQUESTER: Record<InterventionPhase, string> = {
  open: 'En négociation',
  agreed: 'Offre acceptée, à payer',
  in_progress: 'Payée, intervention en cours',
  warranty: 'Terminée, sous garantie',
  disputed: 'Litige en cours',
  closed: 'Clôturée',
  cancelled: 'Annulée'
}

export const PHASE_LABEL_ARTISAN: Record<InterventionPhase, string> = {
  open: 'En négociation',
  agreed: 'Acceptée, en attente du paiement',
  in_progress: 'Payée, à réaliser',
  warranty: 'Terminée, sous garantie',
  disputed: 'Litige en cours',
  closed: 'Clôturée',
  cancelled: 'Annulée'
}

export const PHASE_TONE: Record<InterventionPhase, 'ok' | 'warn' | 'info' | 'neutral' | 'danger'> = {
  open: 'warn', agreed: 'info', in_progress: 'info', warranty: 'ok', disputed: 'danger', closed: 'neutral', cancelled: 'neutral'
}

/** Seule une demande encore ouverte s'annule (400 sinon — l'écran proposait aussi « Annuler » après accord). */
export function canCancel(r: Pick<ArtisanRequestSummary, 'status'>): boolean {
  return r.status === 'open'
}

/** L'avis n'est accepté qu'une fois la demande clôturée (fin de garantie, litige résolu, ou sans retenue). */
export function canReview(r: Pick<ArtisanRequestSummary, 'status'>): boolean {
  return r.status === 'closed'
}

/** Un problème se signale pendant la garantie, s'il reste une part retenue, et une seule fois. */
export function canDispute(r: Pick<ArtisanRequestSummary, 'status' | 'disputed_at' | 'warranty_expires_at' | 'retained_amount'>, now: Date = new Date()): boolean {
  return r.status === 'completed' && !r.disputed_at && Number(r.retained_amount ?? 0) > 0 && !!r.warranty_expires_at && new Date(r.warranty_expires_at) > now
}

export const OFFER_STATUS: Record<string, { label: string; tone: 'ok' | 'warn' | 'neutral' }> = {
  pending: { label: 'En attente', tone: 'warn' },
  accepted: { label: 'Acceptée', tone: 'ok' },
  rejected: { label: 'Refusée', tone: 'neutral' },
  // Une nouvelle offre remplace la précédente (constaté en live) — ce n'est pas un refus.
  superseded: { label: 'Remplacée', tone: 'neutral' }
}

/** Offre en attente de réponse : l'API refuse qu'on réponde à la sienne (403). */
export function pendingOffer(offers: ArtisanOffer[]): ArtisanOffer | null {
  return offers.find(o => o.status === 'pending') ?? null
}

export function isMine(o: Pick<ArtisanOffer, 'proposed_by'>, me: string | null | undefined): boolean {
  return !!me && o.proposed_by === me
}

export interface OfferForm { price: string; warrantyDays: string; retention: string }

/** Contrôles de l'API (prix ≥ 0, garantie 0–90 j, retenue 0–100 %) + prix nul et retenue sans garantie refusés. */
export function validateOffer(f: OfferForm): string | null {
  const price = Number(f.price.replace(/\s/g, ''))
  const warranty = Number(f.warrantyDays)
  const retention = Number(f.retention)
  if (!Number.isInteger(price) || price <= 0) return 'Indiquez un prix supérieur à 0 (nombre entier).'
  if (!Number.isInteger(warranty) || warranty < 0 || warranty > 90) return 'La garantie va de 0 à 90 jours.'
  if (!Number.isInteger(retention) || retention < 0 || retention > 100) return 'La retenue va de 0 à 100 %.'
  if (retention > 0 && warranty === 0) return 'Une retenue n\'a de sens qu\'avec une garantie : indiquez sa durée, ou mettez la retenue à 0 %.'
  return null
}

/** Même calcul que l'API au paiement : la part retenue est arrondie au centime, le reste versé tout de suite. */
export function paymentSplit(price: number, retentionPct: number): { immediate: number; retained: number } {
  const retained = Math.round(price * retentionPct) / 100
  return { immediate: price - retained, retained }
}

/** Répartition d'une proposition de sortie de litige : ce que récupère le demandeur, le reste va à l'artisan. */
export function disputeSplit(retained: number, refund: number): { requester: number; artisan: number } {
  const r = Math.max(0, Math.min(retained, refund))
  return { requester: r, artisan: retained - r }
}

export function validateRefund(value: string, retained: number): string | null {
  const n = Number(value.replace(/\s/g, ''))
  if (!value.trim() || !Number.isFinite(n) || n < 0) return 'Indiquez un montant (0 si rien à rembourser).'
  if (n > retained) return `Le montant ne peut pas dépasser la part retenue (${retained.toLocaleString('fr-FR')} F).`
  return null
}

/** « garantie jusqu'au 4 octobre (7 j restants) ». */
export function warrantyLine(r: Pick<ArtisanRequestSummary, 'warranty_expires_at'>, now: Date = new Date()): string | null {
  if (!r.warranty_expires_at) return null
  const end = new Date(r.warranty_expires_at)
  const days = Math.ceil((end.getTime() - now.getTime()) / 86400000)
  const date = end.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
  return days > 0 ? `garantie jusqu'au ${date} (${days} j restant${days > 1 ? 's' : ''})` : `garantie terminée le ${date}`
}
