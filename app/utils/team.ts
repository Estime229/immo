import type { InvitePayload, InviteResult, Mandate, MandateStatus, MyTeam, RolePreset, TeamInvitation, TeamMember, TeamPermission, TeamRegistry } from '../types/team'

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
 * Filet de sécurité : si `POST /team/invite` répond 5xx, on relit l'équipe pour
 * savoir si l'invitation existe malgré tout (cas fréquent avant le correctif #4).
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

/**
 * Invitations affichées : une invitation par e-mail, et les membres « en attente »
 * qui n'en ont pas (comptes invités avant le correctif #74, sans lien). Depuis
 * la migration 013, une invitation peut être liée à un membre en attente : on ne
 * montre alors qu'une ligne, celle de l'invitation (annulable, avec un lien).
 */
export function pendingRows(team: MyTeam | null): { invitations: TeamInvitation[]; pendingMembers: TeamMember[] } {
  const invitations = team?.invitations ?? []
  const invited = new Set(invitations.map(i => i.email.toLowerCase()))
  const pendingMembers = (team?.members ?? []).filter(m => m.status === 'pending' && !invited.has((m.email ?? '').toLowerCase()))
  return { invitations, pendingMembers }
}

/**
 * Corps d'une nouvelle invitation reprenant une invitation existante (« Nouveau
 * lien ») : même poste, mêmes permissions, mêmes biens. L'API n'a pas de route de
 * relance : on annule l'ancienne puis on recrée celle-ci, qui porte un lien neuf.
 */
export function reinvitePayload(inv: TeamInvitation, presets: RolePreset[]): InvitePayload {
  const custom = inv.custom_preset_name ? presets.find(p => p.name === inv.custom_preset_name) : undefined
  return {
    email: inv.email,
    ...(custom ? { custom_preset_id: custom.id } : { role_preset: inv.role_preset || 'custom', permissions: inv.permissions }),
    property_ids: inv.property_ids
  }
}

/**
 * Ce que l'écran peut affirmer après une invitation. `email_sent` absent
 * (ancienne API) : on ne promet pas qu'un e-mail est parti.
 */
export function inviteDelivery(res: Pick<InviteResult, 'token' | 'email_sent'>): 'sent' | 'link' | 'none' {
  if (res.email_sent === true) return 'sent'
  return res.token ? 'link' : 'none'
}

/** Membre et mandat : l'agent fait-il déjà partie de l'équipe (actif ou invité) ? */
export function inTeam(team: MyTeam | null, email: string | null | undefined): 'active' | 'pending' | null {
  const e = (email ?? '').trim().toLowerCase()
  if (!e || !team) return null
  const m = team.members.find(x => (x.email ?? '').toLowerCase() === e && x.status !== 'revoked')
  if (m) return m.status === 'active' ? 'active' : 'pending'
  return team.invitations.some(i => i.email.toLowerCase() === e) ? 'pending' : null
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

/** Côté agent : l'équipe du mandant dont il est déjà membre actif, s'il y en a une. */
export function mandatorTeam<T extends { team: { owner: { id: string } } }>(memberships: T[], m: Mandate): T | null {
  const owner = m.landlord_id ?? m.agency_id
  return owner ? memberships.find(x => x.team.owner.id === owner) ?? null : null
}

/** Biens du mandant où cet agent est désigné. */
export function propertiesOfAgent<T extends { id: string; name: string; agent_id?: string | null }>(properties: T[], agentId: string): T[] {
  return properties.filter(p => p.agent_id === agentId)
}
