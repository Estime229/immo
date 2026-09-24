import type { NotificationItem } from '~/types/tenant'

/**
 * Notifications — voir 12-INTEGRATION-LOCATAIRE.md, IL7. `subscribe` (Web
 * Push) n'est pas câblé ici : nécessite un service worker côté front, hors
 * périmètre de ce lot.
 */
export function useNotificationsApi() {
  const api = useApi()

  async function list() {
    return api.get<NotificationItem[]>('/notifications')
  }

  async function markRead(id: string) {
    return api.patch<NotificationItem>(`/notifications/${id}/read`)
  }

  async function markAllRead() {
    return api.patch<void>('/notifications/read-all')
  }

  return { list, markRead, markAllRead }
}

/**
 * `title`/`message` sont multilingues ({ fr, en, ... }). Repli sur la
 * première langue disponible si le français manque, jamais un objet brut affiché.
 */
export function localizeNotification(field: Record<string, string> | undefined | null): string {
  if (!field) return ''
  return field.fr ?? Object.values(field)[0] ?? ''
}
