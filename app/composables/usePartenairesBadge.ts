/** Badge « Agences partenaires » du menu Artisan — notifications non lues taguées `metadata.partnership_id` (« Partenariat accepté », vérifié en direct). */
export function usePartenairesBadge() {
  return useLandlordNotificationBadge('partnership_id')
}
