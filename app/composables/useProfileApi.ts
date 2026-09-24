import type { ProfileMe, UpdateProfilePayload, UpdateProfileResult } from '~/types/profile'

/** Module profil KYC — voir 12-INTEGRATION-LOCATAIRE.md, IL8. */
export function useProfileApi() {
  const api = useApi()

  async function fetchMe() {
    return api.get<ProfileMe>('/profile/me')
  }

  /** Toute mise à jour repasse kyc_status à 'pending' côté serveur — reflété dans la réponse. */
  async function update(payload: UpdateProfilePayload) {
    return api.patch<UpdateProfileResult>('/profile/me', payload)
  }

  return { fetchMe, update }
}
