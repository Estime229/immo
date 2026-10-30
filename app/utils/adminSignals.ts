import type { Component } from 'vue'
import { Biohazard, Building, DoorOpen, Droplet, Gavel, KeyRound, MessageSquareWarning, Paintbrush, RefreshCw, Users, Volume2, Wrench, Zap } from '@lucide/vue'
import { DISPUTE_TYPES, MAINTENANCE_TYPES, PRIORITY_OPTIONS, STATUS_OPTIONS, type SignalItem, type SignalPersonInfo, type SignalPriority, type SignalStatus, type SignalType } from '~/composables/useSignals'
import { personName } from '~/utils/avatar'

/**
 * Litiges et maintenance (admin) : deux vues d'une même liste, `GET /signals`, découpée par type.
 * Ce qui leur est commun vit ici et dans `AdminSignalList` / `AdminSignalDetail`.
 */
export type SignalKind = 'dispute' | 'maintenance'

export interface SignalKindConfig {
  types: SignalType[]
  /** Racine des pages : `/admin/litiges`, `/admin/maintenance`. */
  path: string
  /** Libellé du lien retour (= entrée du menu). */
  section: string
  /** « ce litige », « cette demande »… — accords des phrases d'interface. */
  this: string
  pronoun: 'Il' | 'Elle'
  one: string
  next: string
  resolved: string
  inQueue: string
  emptyAll: string
  emptyActive: string
  assignPlaceholder: string
}

export const SIGNAL_KINDS: Record<SignalKind, SignalKindConfig> = {
  dispute: {
    types: DISPUTE_TYPES,
    path: '/admin/litiges',
    section: 'Litiges',
    this: 'ce litige',
    pronoun: 'Il',
    one: 'Litige',
    next: 'Litige suivant',
    resolved: 'Litige marqué résolu',
    inQueue: 'des litiges en cours',
    emptyAll: 'Aucun litige signalé pour l\'instant.',
    emptyActive: 'Aucun litige en cours : tout est traité.',
    assignPlaceholder: 'Nom de la personne qui suit ce litige'
  },
  maintenance: {
    types: MAINTENANCE_TYPES,
    path: '/admin/maintenance',
    section: 'Maintenance',
    this: 'cette demande',
    pronoun: 'Elle',
    one: 'Demande',
    next: 'Demande suivante',
    resolved: 'Demande marquée résolue',
    inQueue: 'des demandes en cours',
    emptyAll: 'Aucune demande de maintenance pour l\'instant.',
    emptyActive: 'Aucune demande de maintenance en cours : tout est traité.',
    assignPlaceholder: 'Nom de l\'artisan ou du prestataire'
  }
}

export const SIGNAL_TYPE_ICON: Record<SignalType, Component> = {
  maintenance_plomberie: Droplet,
  maintenance_electricite: Zap,
  maintenance_serrurerie: KeyRound,
  maintenance_peinture: Paintbrush,
  maintenance_autre: Wrench,
  dispute_landlord: Gavel,
  dispute_neighbor: Users,
  nuisance_sonore: Volume2,
  insalubrite: Biohazard,
  infrastructure_commune: Building,
  tenant_leaving: DoorOpen,
  renewal_request: RefreshCw,
  autre: MessageSquareWarning
}

/** File « en cours » : ce que comptent les pastilles du menu (`useAdminCounts`). */
export function isQueuedSignal(s: Pick<SignalItem, 'status'>): boolean {
  return s.status === 'open' || s.status === 'in_review'
}

export function signalAttachmentCount(s: Pick<SignalItem, 'attachment_count' | 'attachments'>): number {
  return s.attachment_count ?? s.attachments?.length ?? 0
}

export function signalPersonName(p: SignalPersonInfo | null | undefined): string {
  if (!p) return ''
  return personName(p.first_name, p.last_name) || p.email || ''
}

/* ---------- Filtres (dans l'URL) ---------- */

/** `active` (défaut) = ouvert ou pris en charge ; `all` = tous les statuts. */
export type SignalStatusFilter = SignalStatus | 'active' | 'all'

export interface SignalFilters {
  status: SignalStatusFilter
  priority: SignalPriority | ''
  type: SignalType | ''
}

type Query = Record<string, unknown>

function str(v: unknown): string {
  return typeof v === 'string' ? v : Array.isArray(v) && typeof v[0] === 'string' ? v[0] : ''
}

/** Lit `?status=&priority=&type=` ; une valeur inconnue (ou un type de l'autre rubrique) est ignorée. */
export function parseSignalFilters(query: Query, kind: SignalKind): SignalFilters {
  const status = str(query.status)
  const priority = str(query.priority)
  const type = str(query.type)
  return {
    status: status === 'all' || (STATUS_OPTIONS as string[]).includes(status) ? status as SignalStatusFilter : 'active',
    priority: (PRIORITY_OPTIONS as string[]).includes(priority) ? priority as SignalPriority : '',
    type: (SIGNAL_KINDS[kind].types as string[]).includes(type) ? type as SignalType : ''
  }
}

/** Requête d'URL des filtres, sans les valeurs par défaut (la page repart à 1). */
export function signalFiltersToQuery(f: SignalFilters): Record<string, string> {
  const q: Record<string, string> = {}
  if (f.status !== 'active') q.status = f.status
  if (f.priority) q.priority = f.priority
  if (f.type) q.type = f.type
  return q
}

const PRIORITY_RANK: Record<SignalPriority, number> = { urgent: 3, high: 2, medium: 1, low: 0 }

/**
 * Ordre de traitement : la file en cours d'abord, la plus prioritaire puis la plus ancienne en tête ;
 * ensuite les dossiers clos, du plus récent au plus ancien.
 */
export function sortSignalQueue<T extends Pick<SignalItem, 'status' | 'priority' | 'created_at'>>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    const qa = isQueuedSignal(a)
    const qb = isQueuedSignal(b)
    if (qa !== qb) return qa ? -1 : 1
    if (qa) return PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority] || a.created_at.localeCompare(b.created_at)
    return b.created_at.localeCompare(a.created_at)
  })
}

export function filterSignals<T extends SignalItem>(list: T[], kind: SignalKind, f: SignalFilters): T[] {
  const types = SIGNAL_KINDS[kind].types
  return sortSignalQueue(list.filter(s =>
    types.includes(s.signal_type) &&
    (f.status === 'all' || (f.status === 'active' ? isQueuedSignal(s) : s.status === f.status)) &&
    (!f.priority || s.priority === f.priority) &&
    (!f.type || s.signal_type === f.type)
  ))
}

/** Prochain élément de la file en cours de la même rubrique, hors celui qu'on vient de traiter. */
export function nextQueuedSignal<T extends SignalItem>(list: T[], kind: SignalKind, currentId: string): T | null {
  return filterSignals(list, kind, { status: 'active', priority: '', type: '' }).find(s => s.id !== currentId) ?? null
}

/* ---------- Historique ---------- */

export interface SignalEvent {
  at: string
  label: string
  by: string
}

/**
 * Historique reconstitué à partir des dates du signalement : l'API ne tient pas de journal
 * des changements de statut (rien non plus dans `/audit`).
 */
export function signalHistory(s: SignalItem): SignalEvent[] {
  const events: SignalEvent[] = [{ at: s.created_at, label: 'Déclaré', by: signalPersonName(s.author) }]
  if (s.resolved_at) events.push({ at: s.resolved_at, label: 'Marqué résolu', by: signalPersonName(s.resolver) })
  if (s.updated_at && s.updated_at !== s.created_at && s.updated_at !== s.resolved_at) events.push({ at: s.updated_at, label: 'Dernière modification', by: '' })
  return events.sort((a, b) => a.at.localeCompare(b.at))
}
