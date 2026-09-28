/** Badge « Signalements » du menu Pro — notifications non lues taguées `metadata.signalId` (nouveau signalement). Voir useLandlordNotificationBadge. */
export function useLandlordSignalementsBadge() {
  return useLandlordNotificationBadge('signalId')
}
