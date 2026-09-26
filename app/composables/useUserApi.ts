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

  return { deleteAccount, updateIdentity }
}
