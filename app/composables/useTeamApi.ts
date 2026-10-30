import type { InvitePayload, InviteResult, Membership, MyTeam, PublicInvitation, RolePreset, TeamRegistry } from '~/types/team'

/**
 * Équipe (`/team`). `POST /team/invite` ne répond plus 500 après écriture (#4,
 * corrigé le 06/10/2026) ; l'appelant garde le filet `inviteOutcome` au cas où.
 * Annuler une invitation et quitter une équipe : routes ajoutées à la même date (#75).
 */
export function useTeamApi() {
  const api = useApi()
  const pub = usePublicApi()

  return {
    fetchRegistry: () => pub.get<TeamRegistry>('/team/permissions'),
    fetchMyTeam: () => api.get<MyTeam>('/team/my'),
    invite: (payload: InvitePayload) => api.post<InviteResult>('/team/invite', payload),
    updateMember: (id: string, payload: { role_preset?: string; permissions?: string[]; property_ids?: string[] }) => api.patch(`/team/members/${id}`, payload),
    revokeMember: (id: string) => api.delete(`/team/members/${id}`),
    cancelInvitation: (id: string) => api.delete(`/team/invitations/${id}`),
    leaveTeam: (membershipId: string) => api.post(`/team/memberships/${membershipId}/leave`),
    fetchPresets: () => api.get<RolePreset[]>('/team/role-presets'),
    createPreset: (payload: { name: string; permissions: string[] }) => api.post<RolePreset>('/team/role-presets', payload),
    updatePreset: (id: string, payload: { name?: string; permissions?: string[] }) => api.patch<RolePreset>(`/team/role-presets/${id}`, payload),
    deletePreset: (id: string) => api.delete(`/team/role-presets/${id}`),
    fetchInvitation: (token: string) => pub.get<PublicInvitation>(`/team/invitation/${encodeURIComponent(token)}`),
    acceptInvitation: (token: string) => api.post(`/team/invitation/${encodeURIComponent(token)}/accept`),
    fetchMemberships: () => api.get<Membership[]>('/team/memberships')
  }
}
