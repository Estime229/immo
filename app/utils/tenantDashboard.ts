import { invoiceView, sortInvoices } from './leases'
import { bookingPhase } from './bookings'
import type { BookingSummary, HousingRequestSummary, LeaseInvoice, LeaseSummary, NotificationItem, SignalSummary, WaitlistEntry } from '../types/tenant'

/** Une échéance et son bail : de quoi ouvrir le paiement (`/locataire/bail?lease=…&pay=…`). */
export interface LeaseInvoiceInfo {
  lease: LeaseSummary
  invoice: LeaseInvoice
}

/** Fenêtre du rappel « Prochain loyer » : assez tôt pour recharger le wallet à temps. */
export const UPCOMING_RENT_DAYS = 7

/** Jour local AAAA-MM-JJ — même convention que `invoiceView` (leases.ts), qui compare des jours et non des instants. */
function localDay(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Échue = la date d'échéance est passée d'au moins un jour. Avant, la bannière
 * comparait l'instant à minuit UTC du jour d'échéance : le jour même, elle
 * criait « était dû » alors que l'échéancier affichait encore « À payer », et
 * l'échéance n'aurait pu être ni « en retard » ni « à venir » proprement.
 */
function isPastDue(invoice: LeaseInvoice, now: Date) {
  return invoice.due_date.slice(0, 10) < localDay(now)
}

/** Première facture non payée et échue, tous baux confondus — pilote la bannière d'alerte du tableau de bord. */
export function findLateLeaseInvoice(leases: LeaseSummary[], now: Date = new Date()): LeaseInvoiceInfo | null {
  for (const lease of leases) {
    for (const invoice of lease.invoices ?? []) {
      // Échue et encore due — ni payée, ni annulée, ni remboursée (statuts réels, Lot 50).
      if (invoiceView(invoice, now).payable && isPastDue(invoice, now)) {
        return { lease, invoice }
      }
    }
  }
  return null
}

/** Échéance la plus proche d'un bail qui est payable, pas encore échue et due d'ici `days` jours (bornes comprises). */
function upcomingInvoiceOf(lease: LeaseSummary, now: Date, days: number): LeaseInvoice | null {
  // Seul un bail actif (préavis compris, qui reste `active` côté API) a des loyers à payer : une
  // échéance restée `pending` sur un bail signé non payé ou terminé ne doit pas afficher « Payer ».
  if (lease.status !== 'active') return null
  const today = localDay(now)
  const limitDate = new Date(now)
  limitDate.setDate(limitDate.getDate() + days)
  const limit = localDay(limitDate)
  return sortInvoices(lease.invoices).find((invoice) => {
    const day = invoice.due_date.slice(0, 10)
    // `overdue` est posé par le serveur après le délai de grâce : jamais « à venir », quelle que soit la date.
    return invoiceView(invoice, now).payable && invoice.status !== 'overdue' && day >= today && day <= limit
  }) ?? null
}

/**
 * Prochain loyer à payer, tous baux confondus — la plus proche des échéances
 * à venir sous `days` jours. Pilote la carte « Prochain loyer » de l'accueil :
 * jusque-là, rien n'apparaissait avant que le loyer soit déjà en retard.
 */
export function findUpcomingLeaseInvoice(leases: LeaseSummary[], now: Date = new Date(), days = UPCOMING_RENT_DAYS): LeaseInvoiceInfo | null {
  let best: LeaseInvoiceInfo | null = null
  for (const lease of leases) {
    const invoice = upcomingInvoiceOf(lease, now, days)
    if (invoice && (!best || invoice.due_date.slice(0, 10) < best.invoice.due_date.slice(0, 10))) best = { lease, invoice }
  }
  return best
}

/** Clé de l'étape « loyer à venir » — l'accueil s'en sert pour ne pas répéter l'échéance déjà affichée en carte. */
export function upcomingRentStepKey(invoiceId: string) {
  return `lease-rent-${invoiceId}`
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
    } else if (lease.status === 'active') {
      // Loyer à venir sous 7 jours, un par bail ; le loyer déjà échu reste l'affaire de la bannière rouge.
      const invoice = upcomingInvoiceOf(lease, now, UPCOMING_RENT_DAYS)
      if (invoice) {
        const amount = `${Math.round(Number(invoice.amount) || 0).toLocaleString('fr-FR')} F`
        steps.push({
          key: upcomingRentStepKey(invoice.id),
          label: `Loyer du ${shortDay(invoice.due_date)} à payer — ${unitName}`,
          hint: [amount, lease.property?.name].filter(Boolean).join(' · '),
          cta: 'Payer',
          to: `/locataire/bail?lease=${lease.id}&pay=${invoice.id}`,
          kind: 'pay'
        })
      }
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
