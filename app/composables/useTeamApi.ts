import type { InvitePayload, InviteResult, Membership, MyTeam, PublicInvitation, RolePreset, TeamRegistry } from '~/types/team'

/**
 * Équipe (`/team`). `POST /team/invite` répond 500 alors que l'invitation est
 * bien enregistrée (envoi de l'e-mail en échec, #4) : l'appelant relit
 * `GET /team/my` pour savoir ce qui a été écrit (voir `inviteOutcome`).
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
    fetchPresets: () => api.get<RolePreset[]>('/team/role-presets'),
    createPreset: (payload: { name: string; permissions: string[] }) => api.post<RolePreset>('/team/role-presets', payload),
    updatePreset: (id: string, payload: { name?: string; permissions?: string[] }) => api.patch<RolePreset>(`/team/role-presets/${id}`, payload),
    deletePreset: (id: string) => api.delete(`/team/role-presets/${id}`),
    fetchInvitation: (token: string) => pub.get<PublicInvitation>(`/team/invitation/${encodeURIComponent(token)}`),
    acceptInvitation: (token: string) => api.post(`/team/invitation/${encodeURIComponent(token)}/accept`),
    fetchMemberships: () => api.get<Membership[]>('/team/memberships')
  }
}
