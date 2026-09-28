import { formatUnread } from '~/utils/messaging'

/**
 * Compteur de messages non lus, partagé entre la navigation des trois espaces
 * et la messagerie (Lot 55 : GET /messaging/unread-count n'était pas utilisé,
 * rien ne signalait un nouveau message hors de la page Messages).
 */
export function useUnreadMessages() {
  const count = useState<number>('unreadMessages', () => 0)
  const api = useMessagingApi()

  async function refresh() {
    try {
      count.value = (await api.fetchUnreadCount()).total
    } catch {
      // Compteur indicatif : une panne ne doit rien casser ni afficher de faux chiffre.
    }
  }

  /** Sondage léger (60 s, onglet visible seulement) — à lancer depuis un layout, arrêté à son démontage. */
  function startPolling(intervalMs = 60000) {
    refresh()
    const timer = setInterval(() => { if (document.visibilityState === 'visible') refresh() }, intervalMs)
    const onVisible = () => { if (document.visibilityState === 'visible') refresh() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }

  const label = computed(() => formatUnread(count.value))
  return { count, label, refresh, startPolling }
}
