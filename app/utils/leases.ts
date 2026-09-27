import type { LeaseBillingFrequency, LeaseInvoice, LeaseStatus, RenewalIntent } from '../types/tenant'

type LeaseLike = {
  status: LeaseStatus
  renewal_intent?: RenewalIntent | null
  renewal_intent_date?: string | null
  notice_period?: number | null
  signed_at_tenant?: string | null
  entry_paid_at?: string | null
}

function localIso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Phase réelle d'un bail — le statut seul ne suffit pas (vérifié en live, Lot 50) :
 * - un préavis laisse le bail `active` (seul `renewal_intent` passe à `leave`) ;
 * - `terminated` couvre aussi bien une résiliation qu'une annulation pour
 *   entrée jamais payée (distinguées par `entry_paid_at`) ;
 * - un bail actif re-signé par le locataire repasse `signed` alors que
 *   l'entrée est payée (faille API #55) : plus aucune action n'est possible.
 */
export type LeasePhase = 'draft' | 'awaiting_tenant' | 'awaiting_entry' | 'active' | 'notice' | 'terminated' | 'cancelled_unpaid' | 'inconsistent'

export function leasePhase(l: LeaseLike): LeasePhase {
  switch (l.status) {
    case 'draft': return 'draft'
    case 'pending_signature': return 'awaiting_tenant'
    case 'signed': return l.entry_paid_at ? 'inconsistent' : 'awaiting_entry'
    case 'active': return l.renewal_intent === 'leave' ? 'notice' : 'active'
    case 'terminated': return l.entry_paid_at ? 'terminated' : 'cancelled_unpaid'
  }
}

/** Libellés côté propriétaire. */
export const LEASE_PHASE_LABEL: Record<LeasePhase, string> = {
  draft: 'Brouillon',
  awaiting_tenant: 'Attend la signature du locataire',
  awaiting_entry: 'Signé — entrée non payée',
  active: 'Actif',
  notice: 'Préavis donné',
  terminated: 'Terminé',
  cancelled_unpaid: 'Annulé (entrée impayée)',
  inconsistent: 'Statut incohérent'
}

/** Libellés côté locataire. */
export const TENANT_LEASE_PHASE_LABEL: Record<LeasePhase, string> = {
  draft: 'En préparation',
  awaiting_tenant: 'À signer',
  awaiting_entry: 'Entrée à payer',
  active: 'Actif',
  notice: 'Préavis donné',
  terminated: 'Terminé',
  cancelled_unpaid: 'Annulé',
  inconsistent: 'Statut incohérent'
}

export const LEASE_PHASE_TONE: Record<LeasePhase, 'ok' | 'warn' | 'danger' | 'neutral'> = {
  draft: 'neutral',
  awaiting_tenant: 'warn',
  awaiting_entry: 'warn',
  active: 'ok',
  notice: 'warn',
  terminated: 'neutral',
  cancelled_unpaid: 'neutral',
  inconsistent: 'danger'
}

export const LEASE_STEPS = ['Préparation', 'Signatures', "Paiement d'entrée", 'Bail actif', 'Fin de bail']

/** Étape courante (1-indexée, comme `FeedbackStepper`). */
export function leaseStepIndex(phase: LeasePhase): number {
  return { draft: 1, awaiting_tenant: 2, awaiting_entry: 3, inconsistent: 3, active: 4, notice: 5, terminated: 6, cancelled_unpaid: 3 }[phase]
}

/** Seul un bail envoyé et pas encore signé par le locataire se signe — l'API, elle, accepte la signature d'un brouillon ou d'un bail actif (#54, #55). */
export function canTenantSign(l: Pick<LeaseLike, 'status' | 'signed_at_tenant'>): boolean {
  return l.status === 'pending_signature' && !l.signed_at_tenant
}

function addMonths(isoDate: string, months: number): string {
  const d = new Date(`${isoDate.slice(0, 10)}T12:00:00`)
  // Même arithmétique que l'API (`setMonth`), débordement de fin de mois compris.
  d.setMonth(d.getMonth() + months)
  return localIso(d)
}

/**
 * Date de départ d'un préavis. `renewal_intent_date` est la date où le préavis
 * a été donné, pas la date de départ (vérifié en live) : l'API calcule le
 * départ à `renewal_intent_date + notice_period` mois et ne le renvoie que dans
 * la notification du propriétaire.
 */
export function noticeDepartureDate(l: Pick<LeaseLike, 'renewal_intent' | 'renewal_intent_date' | 'notice_period'>): string | null {
  if (l.renewal_intent !== 'leave' || !l.renewal_intent_date) return null
  return addMonths(l.renewal_intent_date, l.notice_period ?? 3)
}

/** Départ si le préavis est donné aujourd'hui — affiché avant de confirmer. */
export function departureIfNoticeToday(noticePeriod: number | null | undefined, now: Date = new Date()): string {
  return addMonths(localIso(now), noticePeriod ?? 3)
}

/** Montant du paiement d'entrée : caution + avance + prépayé, figés à la création du bail. */
export function entryBreakdown(l: { deposit_amount: string | number; advance_target?: string | number | null; prepaid_target?: string | number | null }) {
  const deposit = Number(l.deposit_amount) || 0
  const advance = Number(l.advance_target ?? 0) || 0
  const prepaid = Number(l.prepaid_target ?? 0) || 0
  return { deposit, advance, prepaid, total: deposit + advance + prepaid }
}

export const CANCEL_UNPAID_GRACE_HOURS = 72

/** L'annulation d'un bail signé mais jamais payé n'est permise qu'après 72 h (règle API). */
export function cancelUnpaidState(l: LeaseLike, now: Date = new Date()): { allowed: boolean; hoursLeft: number } | null {
  if (leasePhase(l) !== 'awaiting_entry') return null
  if (!l.signed_at_tenant) return { allowed: false, hoursLeft: CANCEL_UNPAID_GRACE_HOURS }
  const elapsed = (now.getTime() - new Date(l.signed_at_tenant).getTime()) / 3600000
  const left = Math.ceil(CANCEL_UNPAID_GRACE_HOURS - elapsed)
  return left > 0 ? { allowed: false, hoursLeft: left } : { allowed: true, hoursLeft: 0 }
}

/** Statuts réels des factures (`InvoiceStatus` côté API) — le front attendait un « late » qui n'existe pas. */
export function invoiceView(inv: Pick<LeaseInvoice, 'status' | 'due_date'>, now: Date = new Date()): { label: string; tone: 'ok' | 'warn' | 'danger' | 'neutral'; payable: boolean } {
  switch (inv.status) {
    case 'paid': return { label: 'Payé', tone: 'ok', payable: false }
    case 'overdue': return { label: 'En retard', tone: 'danger', payable: true }
    case 'partially_paid': return { label: 'Payé en partie', tone: 'warn', payable: true }
    case 'refunded': return { label: 'Remboursé', tone: 'neutral', payable: false }
    case 'cancelled': return { label: 'Annulé', tone: 'neutral', payable: false }
    default: {
      // `pending` : passe `overdue` seulement après le délai de grâce du serveur — échue avant, déjà en retard pour le locataire.
      const late = inv.due_date.slice(0, 10) < localIso(now)
      return late ? { label: 'En retard', tone: 'danger', payable: true } : { label: 'À payer', tone: 'warn', payable: true }
    }
  }
}

/** Échéancier du plus ancien au plus récent (l'API renvoie l'inverse). */
export function sortInvoices<T extends Pick<LeaseInvoice, 'due_date'>>(invoices: T[] | undefined): T[] {
  return [...(invoices ?? [])].sort((a, b) => a.due_date.localeCompare(b.due_date))
}

/** Facture à régler en premier : la plus ancienne encore payable. */
export function nextPayableInvoice<T extends Pick<LeaseInvoice, 'status' | 'due_date'>>(invoices: T[] | undefined, now: Date = new Date()): T | null {
  return sortInvoices(invoices).find(i => invoiceView(i, now).payable) ?? null
}

export const RENT_LABEL: Record<LeaseBillingFrequency, string> = {
  daily: 'Loyer journalier',
  weekly: 'Loyer hebdomadaire',
  monthly: 'Loyer mensuel',
  quarterly: 'Loyer trimestriel',
  semi_annual: 'Loyer semestriel',
  annual: 'Loyer annuel'
}

export const RENT_SUFFIX: Record<LeaseBillingFrequency, string> = {
  daily: '/ jour', weekly: '/ semaine', monthly: '/ mois', quarterly: '/ trimestre', semi_annual: '/ semestre', annual: '/ an'
}

/** Plafond légal de caution (Loi 2022-30) : 3 mois de loyer, bail mensuel uniquement — même règle que l'API. */
export function depositExceedsCap(frequency: LeaseBillingFrequency, rent: number, deposit: number): boolean {
  return frequency === 'monthly' && rent > 0 && deposit > rent * 3
}

export interface LeaseFormInput {
  tenantId: string
  unitId: string
  rent: string
  deposit: string
  startDate: string
  endDate: string
  noticePeriod: string
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Contrôles absents de l'API (constatés en live, Lot 50) : date invalide → 500,
 * fin avant début acceptée, loyer à 0 accepté, préavis non borné.
 */
export function validateLeaseForm(f: LeaseFormInput): string | null {
  const tenant = f.tenantId.trim()
  if (!tenant) return 'Choisissez le locataire.'
  if (!UUID.test(tenant)) return "L'identifiant du locataire n'est pas valide."
  if (!f.unitId) return 'Choisissez le logement.'
  const rent = f.rent.replace(/\s/g, '')
  if (!/^\d+$/.test(rent) || Number(rent) <= 0) return 'Indiquez un loyer supérieur à 0 (nombre entier).'
  const deposit = f.deposit.replace(/\s/g, '')
  if (!/^\d+$/.test(deposit)) return 'Indiquez la caution (nombre entier, 0 si aucune).'
  if (!ISO_DATE.test(f.startDate) || Number.isNaN(new Date(f.startDate).getTime())) return 'Indiquez une date de début valide.'
  if (f.endDate) {
    if (!ISO_DATE.test(f.endDate) || Number.isNaN(new Date(f.endDate).getTime())) return 'La date de fin est invalide.'
    if (f.endDate <= f.startDate) return 'La date de fin doit être après la date de début.'
  }
  const notice = f.noticePeriod.trim()
  if (!/^\d+$/.test(notice) || Number(notice) < 1 || Number(notice) > 12) return 'Le préavis doit être compris entre 1 et 12 mois.'
  return null
}

/** Date de début passée : acceptée par l'API, mais les échéances depuis cette date seront facturées dès l'activation. */
export function startDateWarning(startDate: string, todayIso: string): string | null {
  if (!ISO_DATE.test(startDate) || startDate >= todayIso) return null
  return "La date de début est passée : dès l'activation, les échéances depuis cette date seront facturées au locataire."
}

/**
 * Bail affiché par défaut côté locataire. Avant : le plus récent — un
 * brouillon tout juste créé masquait le bail actif.
 */
export function pickDefaultLease<T extends LeaseLike & { id: string }>(leases: T[]): T | null {
  const rank: Record<LeasePhase, number> = { awaiting_tenant: 0, awaiting_entry: 1, notice: 2, active: 3, inconsistent: 4, draft: 5, terminated: 6, cancelled_unpaid: 7 }
  return [...leases].sort((a, b) => rank[leasePhase(a)] - rank[leasePhase(b)])[0] ?? null
}
