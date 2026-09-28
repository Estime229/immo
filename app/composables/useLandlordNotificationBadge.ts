import type { NotificationItem } from '~/types/tenant'

/**
 * Badge « non lus » générique pour le menu Pro, dérivé des notifications filtrées sur la
 * présence d'une clé de metadata donnée (ex. `bookingId`, `leaseId`, `inventoryId`, `signalId`).
 * Utilisé pour toute rubrique sans statut « en attente de moi » exploitable côté API — voir
 * useLandlordReservationsBadge pour le premier cas (réservations, lecture seule côté
 * propriétaire). Les notifications, elles, sont déjà tenues à jour serveur (lu/non lu) à chaque
 * événement, donc pas besoin d'un suivi « vu » maison par rubrique.
 */
export function useLandlordNotificationBadge(metadataKey: string) {
  const count = useState<number>(`landlordNotifBadge:${metadataKey}:count`, () => 0)
  const items = useState<NotificationItem[]>(`landlordNotifBadge:${metadataKey}:items`, () => [])
  const notificationsApi = useNotificationsApi()

  async function refresh() {
    try {
      const all = await notificationsApi.list()
      items.value = all.filter(n => typeof n.metadata?.[metadataKey] === 'string')
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
