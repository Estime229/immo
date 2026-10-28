/** Suppression de compte — voir 12-INTEGRATION-LOCATAIRE.md, IL8. */
export function useUserApi() {
  const api = useApi()

  /** Anonymise le compte côté serveur — aucun corps de confirmation attendu (schéma vide). */
  async function deleteAccount() {
    return api.delete<{ message: string; status: string }>('/user/delete', {})
  }

  /**
   * Nom affiché dans les espaces (`users.first_name/last_name`) — distinct du
   * « nom complet » KYC chiffré de `PATCH /profile/me`, qui ne s'affiche nulle part.
   */
  async function updateIdentity(payload: { first_name: string; last_name: string }) {
    return api.post<{ first_name: string; last_name: string }>('/user/update', payload)
  }

  /**
   * Photo de profil — `POST /user/avatar`, champ multipart `avatar`. Réponse non
   * typée par le Swagger (schéma `unknown`) : on rafraîchit `useAuthUser()` via
   * `fetchMe()` après coup plutôt que de se fier à sa forme exacte.
   */
  async function uploadAvatar(file: File) {
    const formData = new FormData()
    formData.append('avatar', file)
    return api.post('/user/avatar', formData)
  }

  return { deleteAccount, updateIdentity, uploadAvatar }
}
