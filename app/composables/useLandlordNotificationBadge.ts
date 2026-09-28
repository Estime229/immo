import type { NotificationItem } from '~/types/tenant'

/**
 * Badge « non lus » générique pour le menu (Pro, Locataire, Artisan — `GET /notifications` est
 * scopé à l'utilisateur courant quel que soit son rôle, malgré le nom historique de ce fichier),
 * dérivé des notifications filtrées sur la présence d'au moins une des clés de metadata données
 * (ex. `bookingId`, `leaseId`, `inventoryId`, `signalId`, `requestId`, `artisan_request_id`,
 * `partnership_id`, `waitlistId`, `transactionId`, `invoiceId` — vérifiées en direct sur
 * `GET /notifications`, côté propriétaire, locataire et artisan).
 * Utilisé pour toute rubrique sans statut « en attente de moi » exploitable côté API — voir
 * useLandlordReservationsBadge pour le premier cas (réservations, lecture seule côté
 * propriétaire). Les notifications, elles, sont déjà tenues à jour serveur (lu/non lu) à chaque
 * événement, donc pas besoin d'un suivi « vu » maison par rubrique.
 */
export function useLandlordNotificationBadge(metadataKeys: string | string[]) {
  const keys = Array.isArray(metadataKeys) ? metadataKeys : [metadataKeys]
  const stateSuffix = keys.join(',')
  const count = useState<number>(`landlordNotifBadge:${stateSuffix}:count`, () => 0)
  const items = useState<NotificationItem[]>(`landlordNotifBadge:${stateSuffix}:items`, () => [])
  const notificationsApi = useNotificationsApi()

  async function refresh() {
    try {
      const all = await notificationsApi.list()
      items.value = all.filter(n => keys.some(k => typeof n.metadata?.[k] === 'string'))
      count.value = items.value.filter(n => !n.isRead).length
    } catch {
      // Compteur indicatif : une panne ne doit rien casser ni afficher de faux chiffre.
    }
  }

  /**
   * Rafraîchit d'abord sans supposer que le `refresh()` du layout (à son montage) a déjà fini —
   * vérifié en direct sur les réservations : sur un backend Render à froid, une navigation rapide
   * arrivait avant la fin de ce premier appel, laissant la liste vide et ne marquant rien.
   */
  async function markAllSeen() {
    await refresh()
    const unread = items.value.filter(n => !n.isRead)
    if (!unread.length) return
    count.value = 0
    items.value = items.value.map(n => ({ ...n, isRead: true }))
    await Promise.allSettled(unread.map(n => notificationsApi.markRead(n.id)))
  }

  return { count, refresh, markAllSeen }
}
