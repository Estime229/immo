/**
 * Badge « Réservations » du menu Pro — notifications non lues taguées `metadata.bookingId`
 * (« Nouvelle réservation payée », « Réservation confirmée » — vérifié en direct sur
 * `GET /notifications`, les deux portent ce champ). Voir useLandlordNotificationBadge : l'API
 * réservations est en lecture seule côté propriétaire (aucun statut « en attente de moi »,
 * voir useLandlordBookingsApi), d'où le passage par les notifications plutôt qu'un compteur API.
 */
export function useLandlordReservationsBadge() {
  return useLandlordNotificationBadge('bookingId')
}
