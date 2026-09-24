import type { NotificationChannel, NotificationPreferences } from '~/types/profile'

/** Préférences de canaux de notification — voir 12-INTEGRATION-LOCATAIRE.md, IL8. */
export function useSettingsApi() {
  const api = useApi()

  async function fetchNotificationPrefs() {
    return api.get<NotificationPreferences>('/settings/me/notifications')
  }

  /** Seuls email/sms/push sont togglables individuellement (contrainte de l'énumération `channel`). */
  async function toggleNotificationChannel(channel: NotificationChannel, enabled: boolean) {
    return api.patch(`/settings/me/notifications/${channel}`, { is_enabled: enabled })
  }

  return { fetchNotificationPrefs, toggleNotificationChannel }
}
