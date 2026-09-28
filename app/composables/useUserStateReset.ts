/**
 * Données d'un compte mises en cache pour la session (Lot 56). La déconnexion
 * effaçait les jetons, pas ces caches : sur un appareil partagé, le compte
 * suivant voyait le wallet, les baux, les favoris ou les retraits du précédent
 * tant que la page n'était pas rechargée (`ensureLoaded()` se contente d'un
 * état « success »). `reset: true` remet chaque état à sa valeur initiale
 * plutôt que de le supprimer : les composants déjà montés (en-tête) gardent
 * une valeur valide.
 */
export const USER_STATE_KEYS = [
  'tenantWallet', 'tenantWalletState', 'tenantLeases', 'tenantLeasesState', 'tenantActiveLeaseId', 'tenantActiveLease',
  'tenantPaidLeases', 'tenantPayInvoiceId', 'withdrawals', 'withdrawalsState', 'unreadMessages',
  'propertyFavoriteIds', 'propertyFavoritesLoaded', 'landlordPromoCodes', 'landlordPromoCodesState',
  'apiActiveTeamId', 'artisanRequestsVersion', 'artisanReqPrefill', 'authRoles'
]

export function resetUserState() {
  clearNuxtState(USER_STATE_KEYS, { reset: true })
}
