import type { Mandate, MandateStatus, MyTeam, TeamMember, TeamPermission, TeamRegistry } from '../types/team'

/**
 * Permissions réellement vérifiées par l'API (lu dans le code, Lot 53) — les
 * autres existent dans le registre mais ne débloquent rien (#77). Affiché pour
 * que le propriétaire sache ce qu'il délègue vraiment.
 */
export const ENFORCED_PERMISSIONS: Record<string, string> = {
  'team:leases:create': 'créer et modifier les brouillons de bail',
  'team:leases:sign': 'envoyer, signer, annuler ou résilier les baux',
  'team:units:edit': 'modifier les logements et leur calendrier',
  'team:properties:edit': 'modifier le bien et ses photos',
  'team:requests:handle': 'répondre aux demandes de logement'
}

/** Registre groupé par catégorie, dans l'ordre de l'API. */
export function groupPermissions(perms: TeamPermission[]): { category: string; items: TeamPermission[] }[] {
  const out: { category: string; items: TeamPermission[] }[] = []
  for (const p of perms) {
    const g = out.find(x => x.category === p.category)
    if (g) g.items.push(p)
    else out.push({ category: p.category, items: [p] })
  }
  return out
}

export function roleLabel(registry: TeamRegistry | null, preset: string, customName?: string | null): string {
  if (customName) return customName
  if (preset === 'custom') return 'Poste personnalisé'
  return registry?.presets[preset]?.label ?? preset
}

export const MEMBER_STATUS: Record<string, { label: string; tone: 'ok' | 'warn' | 'neutral' }> = {
  active: { label: 'Actif', tone: 'ok' },
  pending: { label: 'Invitation en attente', tone: 'warn' },
  revoked: { label: 'Retiré', tone: 'neutral' }
}

export function memberName(m: Pick<TeamMember, 'first_name' | 'last_name' | 'email'>): string {
  return `${m.first_name ?? ''} ${m.last_name ?? ''}`.trim() || m.email || 'Membre'
}

/** « expire dans 6 jours », « expire aujourd'hui », « expirée ». */
export function expiryLabel(iso: string, now: Date = new Date()): { text: string; expired: boolean } {
  const days = Math.ceil((new Date(iso).getTime() - now.getTime()) / 86400000)
  if (days < 0 || (days === 0 && new Date(iso) < now)) return { text: 'expirée', expired: true }
  if (days === 0) return { text: "expire aujourd'hui", expired: false }
  return { text: `expire dans ${days} jour${days > 1 ? 's' : ''}`, expired: false }
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export interface InviteForm {
  email: string
  preset: string
  customPresetId: string
  permissions: string[]
  propertyIds: string[]
}

/** Contrôles avant envoi — l'API répond « Données invalides » sans préciser le champ. */
export function validateInvite(f: InviteForm, team: MyTeam | null): string | null {
  const email = f.email.trim().toLowerCase()
  if (!EMAIL.test(email)) return "Indiquez une adresse e-mail valide."
  if (!f.preset && !f.customPresetId) return 'Choisissez un poste.'
  if (!f.customPresetId && !f.permissions.length) return 'Cochez au moins une permission.'
  if (!f.propertyIds.length) return 'Choisissez au moins un bien : sans bien, le membre ne peut rien faire.'
  if (team?.invitations.some(i => i.email.toLowerCase() === email)) return 'Cette personne a déjà une invitation en attente.'
  if (team?.members.some(m => (m.email ?? '').toLowerCase() === email && m.status !== 'revoked')) return 'Cette personne fait déjà partie de votre équipe (ou a déjà été invitée).'
  return null
}

/**
 * Après un 500 sur `POST /team/invite`, l'écriture a souvent eu lieu (#4) :
 * on relit l'équipe pour dire ce qui existe vraiment.
 */
export function inviteOutcome(team: MyTeam, email: string): 'invitation' | 'member' | 'missing' {
  const e = email.trim().toLowerCase()
  if (team.invitations.some(i => i.email.toLowerCase() === e)) return 'invitation'
  if (team.members.some(m => (m.email ?? '').toLowerCase() === e && m.status === 'pending')) return 'member'
  return 'missing'
}

export function inviteLink(origin: string, token: string): string {
  return `${origin.replace(/\/$/, '')}/invite/${token}`
}

/* ---- Mandats ---- */

export const MANDATE_STATUS: Record<MandateStatus, { label: string; tone: 'ok' | 'warn' | 'neutral' }> = {
  pending: { label: 'En attente de réponse', tone: 'warn' },
  active: { label: 'Actif', tone: 'ok' },
  // L'API ne distingue pas un refus d'une fin de mandat (#77).
  revoked: { label: 'Terminé ou refusé', tone: 'neutral' }
}

function partyName(p: { first_name?: string | null; last_name?: string | null; email?: string | null } | null | undefined): string {
  return `${p?.first_name ?? ''} ${p?.last_name ?? ''}`.trim() || p?.email || ''
}

export function agentName(m: Mandate): string {
  return partyName(m.agent) || 'Agent'
}

/** Côté agent, l'API ne renvoie ni l'e-mail ni le téléphone du mandant (#77) : repli sur son type. */
export function mandatorName(m: Mandate): string {
  if (m.mandator_type === 'agency') return m.agency?.company_name || partyName(m.agency) || 'Une agence'
  return partyName(m.landlord) || 'Un propriétaire (nom non renseigné)'
}

/** Biens du mandant où cet agent est désigné. */
export function propertiesOfAgent<T extends { id: string; name: string; agent_id?: string | null }>(properties: T[], agentId: string): T[] {
  return properties.filter(p => p.agent_id === agentId)
}
