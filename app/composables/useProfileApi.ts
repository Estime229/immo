import type { ProfileMe, UpdateProfilePayload, UpdateProfileResult } from '~/types/profile'

/** Module profil KYC — voir 12-INTEGRATION-LOCATAIRE.md, IL8. */
export function useProfileApi() {
  const api = useApi()

  async function fetchMe() {
    return api.get<ProfileMe>('/profile/me')
  }

  /** Met à jour le profil ; le statut KYC éventuellement modifié par le serveur est reflété dans la réponse. */
  async function update(payload: UpdateProfilePayload) {
    return api.patch<UpdateProfileResult>('/profile/me', payload)
  }

  return { fetchMe, update }
}
