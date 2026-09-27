/**
 * Équipe et mandats — formes réelles vérifiées en live (Lot 53).
 *
 * Deux mécanismes distincts côté API :
 * - l'**équipe** (`/team`) donne à des membres des permissions sur des biens
 *   précis, réellement vérifiées par certaines routes (baux, logements,
 *   calendrier, demandes, artisans) ;
 * - le **mandat** (`/agent-mandates`) relie un propriétaire ou une agence à un
 *   utilisateur au rôle agent, qu'on peut ensuite désigner comme agent d'un
 *   bien (`agent_id`). Il ne donne aucun accès (#76).
 */

export interface TeamPermission {
  key: string
  label: string
  category: string
}

export interface TeamRegistry {
  permissions: TeamPermission[]
  presets: Record<string, { label: string; permissions: string[] }>
}

export type TeamMemberStatus = 'pending' | 'active' | 'revoked'

export interface TeamMember {
  id: string
  user_id: string
  first_name: string | null
  last_name: string | null
  email: string | null
  avatar_url: string | null
  role_preset: string
  custom_preset_name: string | null
  permissions: string[]
  status: TeamMemberStatus
  joined_at: string | null
  properties: { id: string; name: string }[]
}

export interface TeamInvitation {
  id: string
  email: string
  role_preset: string
  custom_preset_name: string | null
  permissions: string[]
  property_ids: string[]
  status: string
  expires_at: string
}

export interface MyTeam {
  team: { id: string; name: string; owner_id: string; created_at: string } | null
  members: TeamMember[]
  invitations: TeamInvitation[]
}

export interface RolePreset {
  id: string
  name: string
  permissions: string[]
}

export interface InvitePayload {
  email: string
  role_preset?: string
  custom_preset_id?: string
  permissions?: string[]
  property_ids: string[]
  team_name?: string
}

/** `type: 'email'` (pas de compte : lien à transmettre) ou `'in_app'` (compte existant). */
export interface InviteResult {
  type: 'email' | 'in_app'
  invitation_id?: string
  member_id?: string
  token?: string
  expires_at?: string
  message: string
}

export interface PublicInvitation {
  id: string
  email: string
  role_preset: string
  team_name: string
  owner_name: string
  status: string
  expires_at: string
  properties: { id: string; name: string }[]
}

export interface Membership {
  membership_id: string
  team: { id: string; name: string; owner: { id: string; first_name: string | null; last_name: string | null } }
  role_preset: string
  permissions: string[]
  joined_at: string | null
  properties: { id: string; name: string }[]
}

export type MandateStatus = 'pending' | 'active' | 'revoked'

interface PartyRef {
  id: string
  first_name: string | null
  last_name: string | null
  avatar_url?: string | null
  email?: string | null
  phone_number?: string | null
}

export interface Mandate {
  id: string
  agent_id: string
  mandator_type: 'landlord' | 'agency'
  landlord_id: string | null
  agency_id: string | null
  status: MandateStatus
  created_at: string
  updated_at: string
  /** Côté mandant (`/managed`). */
  agent?: PartyRef | null
  /** Côté agent (`/mine`) — sans email ni téléphone. */
  landlord?: PartyRef | null
  agency?: (PartyRef & { company_name?: string | null }) | null
}
