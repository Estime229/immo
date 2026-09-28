import type { NotificationItem } from '~/types/tenant'

/**
 * Badge « Réservations » du menu Pro, dérivé des notifications non lues taguées
 * `metadata.bookingId` (« Nouvelle réservation payée », « Réservation confirmée » —
 * vérifié en direct sur `GET /notifications`, les deux portent ce champ).
 *
 * Pas de mécanisme « vu » maison : contrairement à Demandes/Visites/Candidatures,
 * l'API réservations est en lecture seule côté propriétaire (aucun statut « en
 * attente de moi », voir useLandlordBookingsApi) — mais les notifications, elles,
 * sont déjà tenues à jour serveur (lu/non lu) à chaque événement de réservation,
 * donc autant s'appuyer dessus plutôt que réinventer un suivi local par appareil.
 */
export function useLandlordReservationsBadge() {
  const count = useState<number>('landlordReservationsBadgeCount', () => 0)
  const bookingNotifications = useState<NotificationItem[]>('landlordReservationsBadgeItems', () => [])
  const notificationsApi = useNotificationsApi()

  async function refresh() {
    try {
      const all = await notificationsApi.list()
      bookingNotifications.value = all.filter(n => typeof n.metadata?.bookingId === 'string')
      count.value = bookingNotifications.value.filter(n => !n.isRead).length
    } catch {
      // Compteur indicatif : une panne ne doit rien casser ni afficher de faux chiffre.
    }
  }

  /**
   * Appelé à l'ouverture de `/pro/reservations` : marque aussi ces notifications lues dans la
   * cloche. Rafraîchit d'abord sans supposer que `refresh()` (appelé par le layout à son montage)
   * a déjà fini — vérifié en direct : sur un backend Render à froid, cliquer vite arrivait avant
   * la fin de ce premier appel, laissant `bookingNotifications` vide et ne marquant rien.
   */
  async function markAllSeen() {
    await refresh()
    const unread = bookingNotifications.value.filter(n => !n.isRead)
    if (!unread.length) return
    count.value = 0
    bookingNotifications.value = bookingNotifications.value.map(n => ({ ...n, isRead: true }))
    await Promise.allSettled(unread.map(n => notificationsApi.markRead(n.id)))
  }

  return { count, refresh, markAllSeen }
}
