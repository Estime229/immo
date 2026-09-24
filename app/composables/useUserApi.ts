/** Suppression de compte — voir 12-INTEGRATION-LOCATAIRE.md, IL8. */
export function useUserApi() {
  const api = useApi()

  /** Anonymise le compte côté serveur — aucun corps de confirmation attendu (schéma vide). */
  async function deleteAccount() {
    return api.delete<{ message: string; status: string }>('/user/delete', {})
  }

  return { deleteAccount }
}
