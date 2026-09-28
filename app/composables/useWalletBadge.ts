/**
 * Badge « Wallet » (Pro et Locataire) — notifications non lues taguées `metadata.transactionId`
 * (dépôt réussi) ou `metadata.invoiceId` (nouvelle quittance générée, locataire uniquement) —
 * vérifié en direct des deux côtés sur `GET /notifications`.
 */
export function useWalletBadge() {
  return useLandlordNotificationBadge(['transactionId', 'invoiceId'])
}
