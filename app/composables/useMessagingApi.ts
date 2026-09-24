import type { ConversationSummary, MessageItem, MessagesPage } from '~/types/messaging'

/**
 * Module messagerie — voir 12-INTEGRATION-LOCATAIRE.md, IL7,
 * et 11-INTEGRATION-AUTH-ET-PUBLIC.md, I4 pour `createConversation`
 * (démarrer une conversation depuis une fiche logement publique).
 */
export function useMessagingApi() {
  const api = useApi()
  const config = useRuntimeConfig()

  async function fetchConversations() {
    return api.get<ConversationSummary[]>('/messaging/conversations')
  }

  /** Si une conversation existe déjà pour la même demande, le serveur la renvoie sans doublon. */
  async function createConversation(unitId: string, recipientId: string, initialMessage?: string) {
    return api.post<ConversationSummary>('/messaging/conversations', { unit_id: unitId, recipient_id: recipientId, initial_message: initialMessage })
  }

  /** Paginé du plus ancien au plus récent — voir la description de la route. */
  async function fetchMessages(conversationId: string, page = 1, limit = 50) {
    return api.get<MessagesPage>(`/messaging/conversations/${conversationId}/messages`, { page, limit })
  }

  /** 400 si la conversation n'est pas 'active' (archivée/fermée) — mappé comme le reste par apiErrors. */
  async function sendMessage(conversationId: string, content: string) {
    return api.post<MessageItem>(`/messaging/conversations/${conversationId}/messages`, { content })
  }

  /** Pose last_read_at à maintenant — 200 sans corps. */
  async function markRead(conversationId: string) {
    return api.patch<void>(`/messaging/conversations/${conversationId}/read`)
  }

  /** Fichier protégé, comme les pièces jointes de signalement (IL6) — à passer à useProtectedFile(). */
  function attachmentDownloadUrl(messageId: string) {
    return `${config.public.apiProxyBase}/messaging/messages/${messageId}/attachment`
  }

  return { fetchConversations, createConversation, fetchMessages, sendMessage, markRead, attachmentDownloadUrl }
}
