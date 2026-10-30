/**
 * Alertes du tableau de bord pro (`alerts[]` de `GET /property/landlord/stats`).
 *
 * Seul le type `overdue` (métadonnée `invoice_id`) est documenté par le Swagger ;
 * les autres types ne sont pas publiés. On route donc d'abord sur les
 * identifiants présents dans `metadata` (snake_case ou camelCase, l'API mélange
 * les deux), puis sur des mots du `type`, et en dernier recours sur la gravité.
 */
import { verificationLink } from '~/utils/kycStatus'

export interface AlertLike {
  type: string
  severity: string
  metadata: Record<string, unknown> | null
}

export interface AlertTarget {
  to: string
  label: string
}

function idOf(m: Record<string, unknown>, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = m[k]
    if (typeof v === 'string' && v) return v
  }
  return null
}

/** Mots du `type` → écran. L'ordre compte : le premier mot trouvé l'emporte. */
const TYPE_RULES: Array<[RegExp, AlertTarget]> = [
  // Avant les baux : « rental_request » contient « rent ».
  [/candida|rental_request|application/, { to: '/pro/candidatures', label: 'Voir les candidatures' }],
  [/overdue|unpaid|impay|invoice|rent|lease|bail|notice|preavis/, { to: '/pro/baux', label: 'Voir les baux' }],
  [/signal|incident|maintenance|repair/, { to: '/pro/signalements', label: 'Voir les signalements' }],
  [/withdraw|retrait|payout|wallet|transaction/, { to: '/pro/wallet', label: 'Ouvrir le wallet' }],
  [/kyc|verif|identit/, { to: verificationLink('/pro'), label: 'Vérifier mon identité' }],
  [/inventor|edl|etat_des_lieux/, { to: '/pro/edl', label: 'Voir les états des lieux' }],
  [/booking|reservation|stay/, { to: '/pro/reservations', label: 'Voir les réservations' }],
  [/visit/, { to: '/pro/visites', label: 'Voir les visites' }],
  [/housing_request|demand/, { to: '/pro/demandes', label: 'Voir les demandes' }],
  [/mandat/, { to: '/pro/mandats', label: 'Voir les mandats' }],
  [/artisan/, { to: '/pro/artisans', label: 'Voir les artisans' }],
  [/property|unit|vacan|listing|photo/, { to: '/pro/biens', label: 'Voir mes biens' }]
]

/** Repli quand ni les métadonnées ni le type ne disent rien : l'écran le plus probable selon la gravité. */
const SEVERITY_FALLBACK: Record<string, AlertTarget> = {
  danger: { to: '/pro/baux', label: 'Voir les baux' },
  warn: { to: '/pro/baux', label: 'Voir les baux' },
  info: { to: '/pro/demandes', label: 'Voir les demandes' }
}

/** Destination d'une alerte : l'objet précis si son identifiant est connu, sinon la liste concernée. */
export function alertTarget(a: AlertLike): AlertTarget {
  const m = a.metadata ?? {}
  const lease = idOf(m, 'lease_id', 'leaseId')
  if (lease) return { to: `/pro/baux/${lease}`, label: 'Voir le bail' }
  const signal = idOf(m, 'signal_id', 'signalId')
  if (signal) return { to: `/pro/signalements?signal=${signal}`, label: 'Voir le signalement' }
  if (idOf(m, 'withdrawal_id', 'withdrawalId', 'transaction_id', 'transactionId')) return { to: '/pro/wallet', label: 'Ouvrir le wallet' }
  const booking = idOf(m, 'booking_id', 'bookingId')
  if (booking) return { to: `/pro/reservations?booking=${booking}`, label: 'Voir la réservation' }
  const inventory = idOf(m, 'inventory_id', 'inventoryId')
  if (inventory) return { to: `/pro/edl?inventory=${inventory}`, label: "Voir l'état des lieux" }
  const visit = idOf(m, 'visit_id', 'visitId')
  if (visit) return { to: `/pro/visites?visit=${visit}`, label: 'Voir la visite' }
  const request = idOf(m, 'rental_request_id', 'requestId')
  if (request) return { to: `/pro/candidatures?request=${request}`, label: 'Voir la candidature' }
  const artisanRequest = idOf(m, 'artisan_request_id')
  if (artisanRequest) return { to: `/pro/artisans?request=${artisanRequest}`, label: "Voir l'intervention" }
  const mandate = idOf(m, 'mandate_id')
  if (mandate) return { to: `/pro/mandats?mandate=${mandate}`, label: 'Voir le mandat' }
  const conversation = idOf(m, 'conversation_id', 'conversationId')
  if (conversation) return { to: `/pro/messages?conversation=${conversation}`, label: 'Ouvrir la conversation' }
  const property = idOf(m, 'property_id', 'propertyId')
  if (property) return { to: `/pro/biens/fiche?id=${property}`, label: 'Voir le bien' }

  const type = (a.type ?? '').toLowerCase()
  for (const [re, target] of TYPE_RULES) if (re.test(type)) return target
  return SEVERITY_FALLBACK[a.severity] ?? { to: '/pro/baux', label: 'Voir' }
}

/** « 1 urgente », « 2 urgentes », « 3 à surveiller » — accord réel, jamais « (s) ». */
export function severityCountLabel(severity: string, count: number): string {
  if (severity === 'danger') return `${count} urgente${count > 1 ? 's' : ''}`
  if (severity === 'warn') return `${count} à surveiller`
  return `${count} pour information`
}
