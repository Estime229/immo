/**
 * Badge « Artisans » (Pro, demandeur) / « Mes missions » (Artisan, prestataire) — notifications
 * non lues taguées `metadata.artisan_request_id`. Vérifié en direct des deux côtés : le
 * demandeur reçoit « Un artisan a candidaté »/« Nouvelle proposition »/« Intervention
 * terminée »/« Intervention payée », le prestataire reçoit « Nouvelle demande
 * d'intervention »/« Offre acceptée »/« Paiement reçu » — même clé, même mécanisme des deux côtés.
 */
export function useArtisanRequestBadge() {
  return useLandlordNotificationBadge('artisan_request_id')
}
