/** Badge « Baux » du menu Pro — notifications non lues taguées `metadata.leaseId` (prêt à signer, payé, résilié, préavis reçu…). Voir useLandlordNotificationBadge. */
export function useLandlordBauxBadge() {
  return useLandlordNotificationBadge('leaseId')
}
