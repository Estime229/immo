/**
 * Badge « Mes candidatures » (Locataire) — notifications non lues taguées `metadata.requestId`
 * (« Demande acceptée », « Demande refusée » — vérifié en direct). Distinct de
 * `housing_request_id`/`response_id` (demandes de logement génériques, voir NotificationItem) :
 * pas le même flux, pas la même clé, donc pas de risque de confusion avec « Mes demandes ».
 * Côté Pro, « Candidatures » garde son compteur API existant (voir layouts/pro.vue) — le
 * propriétaire n'est justement pas notifié d'une nouvelle candidature (#66), donc les
 * notifications ne couvriraient qu'une partie du signal utile pour lui.
 */
export function useCandidaturesBadge() {
  return useLandlordNotificationBadge('requestId')
}
