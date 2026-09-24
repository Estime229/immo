import type { BookingSummary, HousingRequestSummary, LeaseInvoice, LeaseSummary, NotificationItem, SignalSummary, WaitlistEntry } from '../types/tenant'

export interface LateLeaseInfo {
  lease: LeaseSummary
  invoice: LeaseInvoice
}

/** Première facture non payée et échue, tous baux confondus — pilote la bannière d'alerte du tableau de bord. */
export function findLateLeaseInvoice(leases: LeaseSummary[], now: Date = new Date()): LateLeaseInfo | null {
  for (const lease of leases) {
    for (const invoice of lease.invoices ?? []) {
      if (invoice.status !== 'paid' && new Date(invoice.due_date) < now) {
        return { lease, invoice }
      }
    }
  }
  return null
}

export interface DashboardStep {
  key: string
  label: string
  hint: string
  cta: string
  to: string
}

/**
 * Dérive les actions concrètes disponibles à partir des seules données que
 * ce lot (IL1) récupère réellement — pas d'action inventée sur un module non
 * câblé (état des lieux, messagerie…).
 */
export function buildNextSteps(input: {
  leases: LeaseSummary[]
  bookings: BookingSummary[]
  housingRequests: HousingRequestSummary[]
  waitlist: WaitlistEntry[]
}): DashboardStep[] {
  const steps: DashboardStep[] = []

  for (const lease of input.leases) {
    const unitName = lease.unit?.name ?? 'logement'
    if (lease.status === 'pending_signature') {
      steps.push({
        key: `lease-sign-${lease.id}`,
        label: `Signer votre bail — ${unitName}`,
        hint: lease.property?.name ?? '',
        cta: 'Signer',
        to: '/locataire/bail'
      })
    } else if (lease.status === 'signed') {
      // La double signature ne rend pas le bail actif : seul le paiement d'entrée le fait (voir IL2).
      steps.push({
        key: `lease-entry-${lease.id}`,
        label: `Payer l'entrée dans les lieux — ${unitName}`,
        hint: lease.property?.name ?? '',
        cta: 'Payer',
        to: '/locataire/bail'
      })
    }
  }

  for (const booking of input.bookings) {
    if (booking.status === 'pending_payment') {
      steps.push({
        key: `booking-pay-${booking.id}`,
        label: `Payer votre réservation — ${booking.unit.name}`,
        hint: `${booking.check_in} → ${booking.check_out}`,
        cta: 'Payer',
        to: '/locataire/reservations'
      })
    }
  }

  for (const entry of input.waitlist) {
    if (entry.notified_at) {
      steps.push({
        key: `waitlist-${entry.id}`,
        label: `Une unité de votre liste d'attente est disponible — ${entry.unit.name}`,
        hint: 'Réagissez vite, la place peut repartir.',
        cta: 'Voir',
        to: '/locataire/favoris'
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
        to: '/locataire/demandes'
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
