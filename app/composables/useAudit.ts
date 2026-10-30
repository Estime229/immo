import { ADMIN_ROLE_LABELS, type AdminUserRole } from './useUsers'
import { personName } from '~/utils/avatar'

export interface AuditLogUser {
  id: string
  phone_number: string | null
  first_name: string | null
  last_name: string | null
}

export interface AuditLogEntry {
  id: string
  user_id: string | null
  action: string
  entity_type: string
  entity_id: string
  before_state: Record<string, unknown> | null
  after_state: Record<string, unknown> | null
  description: string
  source: string
  ip_address: string | null
  user_agent: string | null
  created_at: string
  user?: AuditLogUser | null
}

export interface AuditLogResponse {
  data: AuditLogEntry[]
  meta: { total: number; limit: number; offset: number }
}

export interface AuditQuery {
  search?: string
  entityType?: string
  userId?: string
  action?: string
  sortOrder?: 'ASC' | 'DESC'
  limit?: number
  offset?: number
}

/** L'API plafonne `limit` à 100 (vérifié en live : `limit=500` renvoie 100 entrées). */
export const AUDIT_MAX_PAGE_SIZE = 100

/* ---------- Filtres « type d'action » : chaque clé d'URL correspond à un filtre serveur ---------- */

export interface AuditTypeFilter {
  key: string
  label: string
  group: string
  entityType?: string
  action?: string
}

export const AUDIT_TYPE_FILTERS: AuditTypeFilter[] = [
  { key: 'kyc-valide', label: 'Validations KYC', group: "Décisions d'admin", action: 'VERIFY_KYC' },
  { key: 'kyc-refuse', label: 'Refus KYC', group: "Décisions d'admin", action: 'REJECT_KYC' },
  { key: 'kyb-valide', label: 'Validations KYB', group: "Décisions d'admin", action: 'VERIFY_KYB' },
  { key: 'kyb-refuse', label: 'Refus KYB', group: "Décisions d'admin", action: 'REJECT_KYB' },
  { key: 'comptes-crees', label: 'Créations de compte', group: 'Comptes', entityType: 'UserModel', action: 'CREATE' },
  { key: 'comptes-modifies', label: 'Connexions et modifications de compte', group: 'Comptes', entityType: 'UserModel', action: 'UPDATE' },
  { key: 'roles', label: 'Changements de rôle actif', group: 'Comptes', entityType: 'USER_ROLE' },
  { key: 'profils', label: 'Profils', group: 'Comptes', entityType: 'ProfileModel' },
  { key: 'biens', label: 'Biens', group: 'Biens et locations', entityType: 'PropertyModel' },
  { key: 'logements', label: 'Logements', group: 'Biens et locations', entityType: 'UnitModel' },
  { key: 'baux', label: 'Baux', group: 'Biens et locations', entityType: 'lease' },
  { key: 'factures', label: 'Factures', group: 'Biens et locations', entityType: 'invoice' },
  { key: 'etats-des-lieux', label: 'États des lieux', group: 'Biens et locations', entityType: 'inventory' },
  { key: 'visites', label: 'Visites', group: 'Biens et locations', entityType: 'visit' },
  { key: 'reservations', label: 'Réservations', group: 'Biens et locations', entityType: 'booking' },
  { key: 'demandes-location', label: 'Demandes de location', group: 'Biens et locations', entityType: 'rental_request' },
  { key: 'demandes-logement', label: 'Demandes de logement', group: 'Biens et locations', entityType: 'housing_request' },
  { key: 'paiements', label: 'Paiements initiés', group: 'Argent', entityType: 'payment_checkout' },
  { key: 'reconciliations', label: 'Réconciliations de paiement', group: 'Argent', entityType: 'payment_reconciliation' },
  { key: 'wallet', label: 'Mouvements de wallet', group: 'Argent', entityType: 'wallet_transaction' },
  { key: 'fichiers', label: 'Fichiers envoyés', group: 'Fichiers', entityType: 'file' }
]

/* ---------- Période : l'API n'a pas de filtre de date, on parcourt les pages récentes ---------- */

export type AuditPeriod = '' | 'jour' | '7j' | '30j' | 'dates'

export interface AuditRange { from: Date | null; to: Date | null }

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

/** Bornes d'une période (`du`/`au` au format AAAA-MM-JJ pour « dates ») ; null si aucune borne. */
export function auditPeriodRange(period: AuditPeriod, du = '', au = '', now = new Date()): AuditRange | null {
  const today = startOfDay(now)
  const daysBack = (n: number) => new Date(today.getFullYear(), today.getMonth(), today.getDate() - n)
  if (period === 'jour') return { from: today, to: null }
  if (period === '7j') return { from: daysBack(6), to: null }
  if (period === '30j') return { from: daysBack(29), to: null }
  if (period === 'dates') {
    const from = /^\d{4}-\d{2}-\d{2}$/.test(du) ? new Date(`${du}T00:00:00`) : null
    const to = /^\d{4}-\d{2}-\d{2}$/.test(au) ? new Date(`${au}T23:59:59.999`) : null
    return from || to ? { from, to } : null
  }
  return null
}

export function isInAuditRange(iso: string, range: AuditRange): boolean {
  const t = new Date(iso).getTime()
  if (range.from && t < range.from.getTime()) return false
  if (range.to && t > range.to.getTime()) return false
  return true
}

/**
 * Parcourt le journal du plus récent au plus ancien et garde les entrées de la période.
 * S'arrête dès qu'une page descend sous le début de la période, ou après `maxPages` pages :
 * `complete` est faux dans ce dernier cas (la période n'a pas été lue jusqu'au bout).
 */
export async function scanAuditPages(
  fetchPage: (offset: number) => Promise<AuditLogResponse>,
  range: AuditRange,
  maxPages = 10
): Promise<{ data: AuditLogEntry[]; complete: boolean }> {
  const kept: AuditLogEntry[] = []
  let offset = 0
  let total = Number.POSITIVE_INFINITY
  for (let i = 0; i < maxPages && offset < total; i++) {
    const res = await fetchPage(offset)
    total = res.meta.total
    if (!res.data.length) return { data: kept, complete: true }
    offset += res.data.length
    kept.push(...res.data.filter(e => isInAuditRange(e.created_at, range)))
    const oldest = res.data[res.data.length - 1]!
    if (range.from && new Date(oldest.created_at).getTime() < range.from.getTime()) return { data: kept, complete: true }
  }
  return { data: kept, complete: offset >= total }
}

/* ---------- Lecture d'une entrée ---------- */

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
const USER_ENTITIES = new Set(['User', 'UserModel', 'USER_ROLE', 'USER_ROLES'])

/** Libellé et groupe nominal (« un bail ») de chaque type d'objet journalisé. */
const ENTITIES: Record<string, [string, string]> = {
  User: ['Compte', 'un compte'],
  UserModel: ['Compte', 'un compte'],
  USER_ROLE: ['Compte', 'un compte'],
  USER_ROLES: ['Compte', 'un compte'],
  ProfileModel: ['Profil', 'un profil'],
  profile: ['Profil', 'un profil'],
  LandlordProfile: ['Profil propriétaire', 'un profil propriétaire'],
  PropertyModel: ['Bien', 'un bien'],
  UnitModel: ['Logement', 'un logement'],
  file: ['Fichier', 'un fichier'],
  lease: ['Bail', 'un bail'],
  invoice: ['Facture', 'une facture'],
  inventory: ['État des lieux', 'un état des lieux'],
  visit: ['Visite', 'une visite'],
  booking: ['Réservation', 'une réservation'],
  rental_request: ['Demande de location', 'une demande de location'],
  housing_request: ['Demande de logement', 'une demande de logement'],
  housing_request_response: ['Réponse à une demande', 'une réponse à une demande de logement'],
  payment_checkout: ['Paiement', 'un paiement'],
  payment_reconciliation: ['Réconciliation', 'une réconciliation de paiement'],
  wallet_transaction: ['Mouvement de wallet', 'un mouvement de wallet']
}

export function auditEntityLabel(entityType: string): string {
  return ENTITIES[entityType]?.[0] ?? entityType
}

const FIELD_LABELS: Record<string, string> = {
  last_login_at: 'Dernière connexion',
  role: 'Rôle actif',
  last_active_role: 'Dernier rôle utilisé',
  roles: 'Rôles',
  status: 'Statut',
  is_verified: 'Compte vérifié',
  first_name: 'Prénom',
  last_name: 'Nom',
  email: 'E-mail',
  phone_number: 'Téléphone',
  is_profile_complete: 'Profil complet',
  is_system: 'Compte système',
  phone_verified: 'Téléphone vérifié',
  preferred_lang: 'Langue',
  preferred_theme: 'Thème',
  preferred_currency: 'Devise',
  avatar_url: 'Photo de profil',
  admin_level: 'Niveau admin',
  kyc_status: 'Statut KYC',
  kyc_reviewed_at: 'KYC examiné le',
  kyc_submitted_at: 'KYC déposé le',
  kyc_rejection_reason: 'Motif du refus KYC',
  full_name_enc: 'Nom légal',
  signature_data: 'Signature',
  name: 'Nom',
  description: 'Description',
  price: 'Prix',
  min_duration_days: 'Séjour minimum',
  max_duration_days: 'Séjour maximum',
  gps_latitude: 'Latitude',
  gps_longitude: 'Longitude',
  neighborhood_id: 'Quartier',
  city_id: 'Ville',
  address: 'Adresse',
  characteristics: 'Caractéristiques',
  is_publicly_listed: 'Publié',
  is_suspended: 'Suspendu',
  suspended_reason: 'Motif de suspension',
  amount: 'Montant',
  due_date: 'Échéance',
  next_billing_date: 'Prochaine facturation',
  paymentMethod: 'Moyen de paiement',
  reason: 'Motif',
  url: 'Adresse du fichier',
  type: 'Type',
  mimetype: 'Format'
}

export function auditFieldLabel(key: string): string {
  return FIELD_LABELS[key] ?? key
}

/** Champs jamais réaffichés, même si l'API les journalise (empreintes, sels, données chiffrées…). */
export function isSensitiveField(key: string): boolean {
  return /(password|hash|salt|secret|token|_enc$|^cpi_|signature_data|id_card)/i.test(key)
}

const KYC_LABELS: Record<string, string> = { pending: 'en attente', verified: 'vérifié', rejected: 'refusé', not_submitted: 'non déposé' }
const STATUS_LABELS: Record<string, string> = { active: 'actif', restricted: 'restreint', banned: 'banni', suspended: 'suspendu' }

function roleLabel(role: unknown): string {
  return typeof role === 'string' ? (ADMIN_ROLE_LABELS[role as AdminUserRole] ?? role) : ''
}

function truncate(s: string, max = 160) {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s
}

/** Valeur lisible d'un champ journalisé : dates en clair, booléens en oui/non, données sensibles masquées. */
export function formatAuditValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return 'vide'
  if (isSensitiveField(key)) return 'masqué'
  if (typeof value === 'boolean') return value ? 'oui' : 'non'
  if (typeof value === 'string') {
    if (key === 'role' || key === 'last_active_role') return roleLabel(value)
    if (key === 'kyc_status') return KYC_LABELS[value] ?? value
    if (key === 'status') return STATUS_LABELS[value] ?? value
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) {
      const d = new Date(value)
      if (!Number.isNaN(d.getTime())) return d.toLocaleString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    }
    return truncate(value)
  }
  if (Array.isArray(value) && value.every(v => typeof v === 'string')) {
    return value.length ? value.map(v => (key === 'roles' ? roleLabel(v) : v)).join(', ') : 'aucun'
  }
  return truncate(typeof value === 'object' ? JSON.stringify(value) : String(value))
}

export interface AuditChange { key: string; label: string; before: string | null; after: string | null }

const CREATION_NOISE = new Set(['id', 'created_at', 'updated_at', 'deleted_at'])

/** Anciennes et nouvelles valeurs ; pour une création, seulement les valeurs renseignées. */
export function auditChanges(e: Pick<AuditLogEntry, 'before_state' | 'after_state'>): AuditChange[] {
  const before = e.before_state ?? {}
  const after = e.after_state ?? {}
  const creation = !e.before_state && !!e.after_state
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter(k => !creation || (!CREATION_NOISE.has(k) && after[k] !== null && after[k] !== undefined && after[k] !== ''))
    .map(k => ({
      key: k,
      label: auditFieldLabel(k),
      before: k in before ? formatAuditValue(k, before[k]) : null,
      after: k in after ? formatAuditValue(k, after[k]) : null
    }))
}

export interface AuditActor { kind: 'user' | 'system' | 'unknown'; label: string; userId: string | null }

/**
 * Auteur d'une entrée. Une connexion, une inscription ou la création automatique d'un profil
 * arrivent sans `user_id` (constaté en live) : l'acteur reste « non identifié » plutôt que deviné.
 */
export function auditActor(e: Pick<AuditLogEntry, 'user' | 'user_id' | 'source'>): AuditActor {
  if (e.user) {
    const label = personName(e.user.first_name, e.user.last_name) || e.user.phone_number || `Compte ${e.user.id.slice(0, 8)}`
    return { kind: 'user', label, userId: e.user.id }
  }
  if (e.user_id) return { kind: 'user', label: `Compte ${e.user_id.slice(0, 8)}`, userId: e.user_id }
  if (e.source === 'cron') return { kind: 'system', label: 'Tâche planifiée', userId: null }
  if (e.source === 'webhook') return { kind: 'system', label: 'Prestataire de paiement', userId: null }
  return { kind: 'unknown', label: 'Acteur non identifié', userId: null }
}

export interface AuditTarget { kind: 'user' | 'property' | 'other'; id: string; label: string; to: string | null }

function stateString(e: Pick<AuditLogEntry, 'before_state' | 'after_state'>, key: string): string | null {
  const a = e.after_state?.[key]
  const b = e.before_state?.[key]
  return (typeof a === 'string' && a) || (typeof b === 'string' && b) || null
}

function userTarget(id: string, email: string | null = null): AuditTarget {
  return { kind: 'user', id, label: email ?? `Compte ${id.slice(0, 8)}`, to: `/admin/utilisateurs/${id}` }
}

/** Objet visé, avec un lien vers sa fiche quand c'est un compte ou un bien. */
export function auditTarget(e: AuditLogEntry): AuditTarget {
  const short = e.entity_id.slice(0, 8)
  if (USER_ENTITIES.has(e.entity_type)) return userTarget(e.entity_id, stateString(e, 'email'))
  if (['ProfileModel', 'profile', 'LandlordProfile'].includes(e.entity_type)) {
    const userId = stateString(e, 'user_id') ?? /utilisateur\s+([0-9a-f-]{36})/i.exec(e.description)?.[1] ?? null
    if (userId && UUID.test(userId)) return userTarget(userId)
  }
  if (e.entity_type === 'PropertyModel') {
    const name = stateString(e, 'name')
    return { kind: 'property', id: e.entity_id, label: name ? `Bien « ${name} »` : `Bien ${short}`, to: `/admin/biens/${e.entity_id}` }
  }
  if (e.entity_type === 'UnitModel') {
    const name = stateString(e, 'name')
    const propertyId = stateString(e, 'property_id')
    return { kind: 'property', id: propertyId ?? e.entity_id, label: name ? `Logement « ${name} »` : `Logement ${short}`, to: propertyId ? `/admin/biens/${propertyId}` : null }
  }
  return { kind: 'other', id: e.entity_id, label: `${auditEntityLabel(e.entity_type)} ${short}`, to: null }
}

export interface AuditSummary {
  actor: AuditActor
  target: AuditTarget
  /** Phrase verbale à placer après le nom de l'acteur (« a validé le dossier KYC »). */
  verb: string
  /** Même fait sans acteur (« Dossier KYC validé ») — utilisé quand l'acteur est inconnu ou que l'API fournit déjà un constat. */
  statement: string
  reason: string | null
}

/** Fichier envoyé, selon son type : [après le nom de l'acteur, constat]. */
const FILE_KINDS: Record<string, [string, string]> = {
  document: ['un document', 'Document envoyé'],
  id_card: ["une pièce d'identité", "Pièce d'identité envoyée"],
  avatar: ['une photo de profil', 'Photo de profil envoyée'],
  image: ['une photo', 'Photo envoyée']
}

/** Descriptions que l'API rédige en anglais. */
const ENGLISH_DESCRIPTIONS: Array<[RegExp, string]> = [
  [/^Visit confirmed/i, 'Visite confirmée'],
  [/^Visit requested/i, 'Visite demandée'],
  [/^Visit (cancelled|canceled)/i, 'Visite annulée'],
  [/^Signature saved/i, 'Signature enregistrée'],
  [/^Inventory PDF generated/i, "PDF de l'état des lieux généré"]
]

function changedKeys(e: Pick<AuditLogEntry, 'before_state' | 'after_state'>) {
  return [...new Set([...Object.keys(e.before_state ?? {}), ...Object.keys(e.after_state ?? {})])].filter(k => k !== 'updated_at')
}

/** « statut, position GPS » : champs modifiés en clair, latitude et longitude fusionnées. */
function fieldList(keys: string[]) {
  const labels = keys.map(k => (k === 'gps_latitude' || k === 'gps_longitude' ? 'position GPS' : auditFieldLabel(k).toLowerCase()))
  return [...new Set(labels)].join(', ')
}

function phrase(verb: string, statement: string) {
  return { verb, statement }
}

function describePhrase(e: AuditLogEntry, self: boolean): { verb: string; statement: string } {
  const before = e.before_state ?? {}
  const after = e.after_state ?? {}
  const keys = changedKeys(e)
  const t = e.entity_type
  const a = e.action

  if (a === 'VERIFY_KYC') return phrase('a validé le dossier KYC', 'Dossier KYC validé')
  if (a === 'REJECT_KYC') return phrase('a refusé le dossier KYC', 'Dossier KYC refusé')
  if (a === 'VERIFY_KYB') return phrase("a validé l'activité professionnelle (KYB)", 'Activité professionnelle (KYB) validée')
  if (a === 'REJECT_KYB') return phrase("a refusé l'activité professionnelle (KYB)", 'Activité professionnelle (KYB) refusée')

  if (t === 'UserModel' || t === 'User') {
    if (a === 'CREATE') return phrase('a créé un compte', 'Compte créé')
    if (a === 'UPDATE' && keys.length) {
      if (keys.every(k => k === 'last_login_at')) return phrase("s'est connecté", 'Connexion au compte')
      if (keys.includes('status')) {
        const change = `${formatAuditValue('status', before.status)} → ${formatAuditValue('status', after.status)}`
        return phrase(`a changé le statut du compte (${change})`, `Statut du compte : ${change}`)
      }
      if (keys.includes('role')) return phrase(`a basculé ${self ? 'son' : 'le'} rôle actif vers « ${roleLabel(after.role)} »`, `Rôle actif basculé vers « ${roleLabel(after.role)} »`)
      return phrase(`a modifié ${self ? 'son compte' : 'le compte'} (${fieldList(keys)})`, `Compte modifié (${fieldList(keys)})`)
    }
  }
  if (t === 'USER_ROLE' && typeof after.role === 'string') {
    return phrase(`a basculé ${self ? 'son' : 'le'} rôle actif vers « ${roleLabel(after.role)} »`, `Rôle actif basculé vers « ${roleLabel(after.role)} »`)
  }
  if (t === 'USER_ROLES' && Array.isArray(after.roles)) {
    const previous = Array.isArray(before.roles) ? before.roles : []
    const added = (after.roles as unknown[]).filter(r => !previous.includes(r)).map(roleLabel).filter(Boolean)
    if (added.length) {
      const list = added.map(r => `« ${r} »`).join(', ')
      return phrase(`a ajouté le rôle ${list} ${self ? 'à son compte' : 'au compte'}`, `Rôle ${list} ajouté au compte`)
    }
  }
  if (t === 'ProfileModel') {
    if (a === 'CREATE') return phrase('a créé un profil', 'Profil créé')
    if (keys.includes('kyc_status')) {
      const change = `${formatAuditValue('kyc_status', before.kyc_status)} → ${formatAuditValue('kyc_status', after.kyc_status)}`
      return phrase(`a changé le statut KYC (${change})`, `Statut KYC : ${change}`)
    }
    if (keys.includes('signature_data')) return phrase(`a enregistré ${self ? 'sa' : 'une'} signature`, 'Signature enregistrée')
    if (keys.includes('full_name_enc')) return phrase(`a mis à jour ${self ? 'son' : 'le'} nom légal`, 'Nom légal mis à jour')
  }
  if (t === 'PropertyModel' || t === 'UnitModel') {
    const noun = t === 'PropertyModel' ? 'le bien' : 'le logement'
    const name = typeof after.name === 'string' ? ` « ${after.name} »` : ''
    if (a === 'CREATE') return phrase(`a créé ${noun}${name}`, `${t === 'PropertyModel' ? 'Bien' : 'Logement'} créé${name}`)
    if (a === 'DELETE') return phrase(`a supprimé ${noun}`, `${t === 'PropertyModel' ? 'Bien' : 'Logement'} supprimé`)
    if (a === 'UPDATE' && keys.length) return phrase(`a modifié ${noun} (${fieldList(keys)})`, `${t === 'PropertyModel' ? 'Bien' : 'Logement'} modifié (${fieldList(keys)})`)
  }
  if (t === 'file' && a === 'CREATE') {
    const [np, done] = FILE_KINDS[String(after.type)] ?? ['un fichier', 'Fichier envoyé']
    const name = /\)\s*:\s*(.+)$/.exec(e.description)?.[1]?.trim()
    const suffix = name ? ` (${name})` : ''
    return phrase(`a envoyé ${np}${suffix}`, `${done}${suffix}`)
  }

  // Descriptions génériques de l'API (« Mise à jour de UnitModel ») : remplacées par l'objet en clair.
  const generic = !e.description || /^(Mise à jour|Création|Suppression) de \w+$/.test(e.description)
  if (generic) {
    const [label, np] = ENTITIES[t] ?? [t, t]
    if (a === 'CREATE') return phrase(`a créé ${np}`, `Création : ${label.toLowerCase()}`)
    if (a === 'DELETE') return phrase(`a supprimé ${np}`, `Suppression : ${label.toLowerCase()}`)
    if (a === 'UPDATE') return phrase(`a modifié ${np}${keys.length ? ` (${fieldList(keys)})` : ''}`, `Modification : ${label.toLowerCase()}${keys.length ? ` (${fieldList(keys)})` : ''}`)
    return phrase('', `${label} · ${a}`)
  }

  // Sinon la description de l'API fait foi (traduite quand elle est en anglais).
  const translated = ENGLISH_DESCRIPTIONS.find(([re]) => re.test(e.description))?.[1]
  return phrase('', translated ?? e.description)
}

/** Lecture d'une entrée : qui, quoi (en phrase), sur quel objet, et le motif s'il y en a un. */
export function describeAuditEntry(e: AuditLogEntry): AuditSummary {
  const actor = auditActor(e)
  const target = auditTarget(e)
  const self = actor.userId !== null && target.kind === 'user' && target.id === actor.userId
  const { verb, statement } = describePhrase(e, self)
  const after = e.after_state ?? {}
  const reasonFromState = typeof after.reason === 'string' ? after.reason : typeof after.kyc_rejection_reason === 'string' ? after.kyc_rejection_reason : null
  const reason = reasonFromState || /Raison\s*:\s*(.+)$/i.exec(e.description)?.[1]?.trim() || null
  return { actor, target, verb, statement, reason }
}

/** Entrées regroupées par jour (heure locale), dans l'ordre reçu. */
export function groupAuditByDay(entries: AuditLogEntry[], now = new Date()) {
  const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const today = dayKey(now)
  const yesterday = dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1))
  const groups: Array<{ key: string; label: string; entries: AuditLogEntry[] }> = []
  for (const e of entries) {
    const d = new Date(e.created_at)
    const key = dayKey(d)
    let group = groups.find(g => g.key === key)
    if (!group) {
      const long = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) })
      const label = key === today ? `Aujourd'hui · ${long}` : key === yesterday ? `Hier · ${long}` : long
      group = { key, label, entries: [] }
      groups.push(group)
    }
    group.entries.push(e)
  }
  return groups
}

export function useAudit() {
  const { apiFetch } = useApi()

  function fetchAuditLogs(query: AuditQuery) {
    return apiFetch<AuditLogResponse>('/audit', { query: { ...query } })
  }

  /** Entrées d'une période (l'API n'a pas de filtre de date) : parcours des pages les plus récentes. */
  function fetchAuditLogsInPeriod(query: Omit<AuditQuery, 'limit' | 'offset' | 'sortOrder'>, range: AuditRange, maxPages = 10) {
    return scanAuditPages(offset => fetchAuditLogs({ ...query, sortOrder: 'DESC', limit: AUDIT_MAX_PAGE_SIZE, offset }), range, maxPages)
  }

  return { fetchAuditLogs, fetchAuditLogsInPeriod }
}
