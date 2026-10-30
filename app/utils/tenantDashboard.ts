import { invoiceView } from './leases'
import { bookingPhase } from './bookings'
import type { BookingSummary, HousingRequestSummary, LeaseInvoice, LeaseSummary, NotificationItem, SignalSummary, WaitlistEntry } from '../types/tenant'

export interface LateLeaseInfo {
  lease: LeaseSummary
  invoice: LeaseInvoice
}

/** Première facture non payée et échue, tous baux confondus — pilote la bannière d'alerte du tableau de bord. */
export function findLateLeaseInvoice(leases: LeaseSummary[], now: Date = new Date()): LateLeaseInfo | null {
  for (const lease of leases) {
    for (const invoice of lease.invoices ?? []) {
      // Échue et encore due — ni payée, ni annulée, ni remboursée (statuts réels, Lot 50).
      if (invoiceView(invoice, now).payable && new Date(invoice.due_date) < now) {
        return { lease, invoice }
      }
    }
  }
  return null
}

/** Nature de l'étape — choisit l'icône sur le tableau de bord. */
export type DashboardStepKind = 'sign' | 'pay' | 'stay' | 'waitlist' | 'request' | 'inventory'

export interface DashboardStep {
  key: string
  label: string
  hint: string
  cta: string
  to: string
  kind?: DashboardStepKind
}

function shortDay(iso: string) {
  return new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

/**
 * Dérive les actions concrètes disponibles à partir des seules données que
 * ce lot (IL1) récupère réellement — pas d'action inventée sur un module non
 * câblé (état des lieux, messagerie…). Les séjours courte durée confirmés
 * (en cours ou à venir) y figurent aussi : sans eux, un voyageur en plein
 * séjour lisait « Rien de particulier à faire ».
 */
export function buildNextSteps(input: {
  leases: LeaseSummary[]
  bookings: BookingSummary[]
  housingRequests: HousingRequestSummary[]
  waitlist: WaitlistEntry[]
}, now: Date = new Date()): DashboardStep[] {
  const steps: DashboardStep[] = []

  for (const lease of input.leases) {
    const unitName = lease.unit?.name ?? 'logement'
    if (lease.status === 'pending_signature') {
      steps.push({
        key: `lease-sign-${lease.id}`,
        label: `Signer votre bail — ${unitName}`,
        hint: lease.property?.name ?? '',
        cta: 'Signer',
        to: `/locataire/bail?lease=${lease.id}`,
        kind: 'sign'
      })
    } else if (lease.status === 'signed') {
      // La double signature ne rend pas le bail actif : seul le paiement d'entrée le fait (voir IL2).
      steps.push({
        key: `lease-entry-${lease.id}`,
        label: `Payer l'entrée dans les lieux — ${unitName}`,
        hint: lease.property?.name ?? '',
        cta: 'Payer',
        to: `/locataire/bail?lease=${lease.id}`,
        kind: 'pay'
      })
    }
  }

  for (const booking of input.bookings) {
    const phase = bookingPhase(booking, now)
    const place = booking.unit?.name ?? 'logement'
    const dates = `Du ${shortDay(booking.check_in)} au ${shortDay(booking.check_out)}`
    // Un hold expiré n'est plus payable : on ne le propose pas.
    if (phase === 'hold') {
      steps.push({
        key: `booking-pay-${booking.id}`,
        label: `Payer votre réservation — ${place}`,
        hint: dates,
        cta: 'Payer',
        to: `/locataire/reservations?booking=${booking.id}`,
        kind: 'pay'
      })
    } else if (phase === 'ongoing') {
      steps.push({
        key: `booking-stay-${booking.id}`,
        label: `Séjour en cours — ${place}`,
        hint: `Départ le ${shortDay(booking.check_out)}`,
        cta: 'Voir',
        to: `/locataire/reservations?booking=${booking.id}`,
        kind: 'stay'
      })
    } else if (phase === 'upcoming') {
      steps.push({
        key: `booking-stay-${booking.id}`,
        label: `Arrivée le ${shortDay(booking.check_in)} — ${place}`,
        hint: dates,
        cta: 'Voir',
        to: `/locataire/reservations?booking=${booking.id}`,
        kind: 'stay'
      })
    }
  }

  for (const entry of input.waitlist) {
    if (entry.notified_at) {
      // `GET /units/waitlist/mine` joint l'unité complète, `property_id` compris (colonne de l'entité) — absent du type.
      const propertyId = (entry.unit as { property_id?: string | null }).property_id
      steps.push({
        key: `waitlist-${entry.id}`,
        label: `Un logement de votre liste d'attente est disponible — ${entry.unit.name}`,
        hint: 'Réagissez vite, la place peut repartir.',
        cta: "Voir l'annonce",
        to: propertyId ? `/biens/${propertyId}?unit=${entry.unit_id}` : '/recherche',
        kind: 'waitlist'
      })
    }
  }

  for (const hr of input.housingRequests) {
    if (hr.status === 'open' && hr.response_count > 0) {
      steps.push({
        key: `hr-${hr.id}`,
        label: `${hr.response_count} réponse${hr.response_count > 1 ? 's' : ''} reçue${hr.response_count > 1 ? 's' : ''} à votre recherche`,
        hint: hr.description,
        cta: 'Voir',
        to: `/locataire/demandes?request=${hr.id}`,
        kind: 'request'
      })
    }
  }

  return steps
}

export interface ActivityEntry {
  key: string
  label: string
  date: string
  dot: string
}

/**
 * Fusionne signalements et notifications en un seul fil chronologique.
 * Les deux sources ont une date de création, mais sous des noms différents :
 * `created_at` (signaux) vs `createdAt` (notifications, seul endpoint de
 * toute l'API dans ce cas — vérifié en direct, voir NotificationItem).
 */
export function buildActivityFeed(
  signals: SignalSummary[],
  notifications: NotificationItem[],
  localize: (field: Record<string, string> | undefined | null) => string,
  limit = 6
): ActivityEntry[] {
  const fromSignals: ActivityEntry[] = signals.map(s => ({
    key: `signal-${s.id}`,
    label: `Signalement : ${s.title}`,
    date: s.created_at,
    dot: 'bg-clay-500'
  }))
  const fromNotifications: ActivityEntry[] = notifications.map(n => ({
    key: `notif-${n.id}`,
    label: localize(n.title),
    date: n.createdAt,
    dot: n.isRead ? 'bg-sand-400' : 'bg-info-fg'
  }))

  return [...fromSignals, ...fromNotifications]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, limit)
}

/**
 * États des lieux qui attendent la signature du locataire (Lot 52) — jusqu'ici
 * seule une notification le signalait, rien sur le tableau de bord.
 */
export function inventorySignSteps(items: { inv: { id: string; type: string; status: string; tenant_signature: string | null }; place: string }[]): DashboardStep[] {
  return items
    .filter(({ inv }) => inv.status === 'pending_signature' && !inv.tenant_signature)
    .map(({ inv, place }) => ({
      key: `edl-sign-${inv.id}`,
      label: `Signer l'état des lieux ${inv.type === 'exit' ? 'de sortie' : "d'entrée"} — ${place}`,
      hint: 'Relisez-le avant de signer : il sert de référence pour la caution.',
      cta: 'Relire et signer',
      to: `/locataire/edl?inventory=${inv.id}`,
      kind: 'inventory' as const
    }))
}
