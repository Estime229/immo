import type { ConversationSummary, MessageItem, MessagesPage, SendMessagePayload } from '~/types/messaging'
import type { FileUploadResult } from '~/types/tenant'
import { findConversation } from '~/utils/messaging'

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

  /** Création brute : le serveur ne déduplique que pour une même demande de logement (#92). Passer par openConversation(). */
  async function createNewConversation(unitId: string, recipientId: string, initialMessage?: string) {
    return api.post<ConversationSummary>('/messaging/conversations', { unit_id: unitId, recipient_id: recipientId, initial_message: initialMessage })
  }

  /**
   * Réutilise la conversation active sur ce logement avec ce destinataire, sinon
   * en crée une (Lot 55). Lot 56 : le message d'ouverture n'est plus renvoyé
   * dans une conversation existante (« Bonjour, je suis intéressé(e)… » à chaque clic).
   */
  async function openConversation(unitId: string, recipientId: string, initialMessage?: string) {
    const existing = findConversation(await fetchConversations(), unitId, recipientId)
    return existing ?? createNewConversation(unitId, recipientId, initialMessage)
  }
  /** Ancien nom, gardé pour les écrans qui l'appellent encore (fiche d'un logement) : même comportement sans doublon. */
  const createConversation = openConversation

  /** Paginé du plus ancien au plus récent — voir la description de la route. */
  async function fetchMessages(conversationId: string, page = 1, limit = 50) {
    return api.get<MessagesPage>(`/messaging/conversations/${conversationId}/messages`, { page, limit })
  }

  /** 400 si la conversation n'est pas 'active' (archivée/fermée), si le contenu est vide ou dépasse 5 000 caractères. */
  async function sendMessage(conversationId: string, payload: string | SendMessagePayload) {
    const body = typeof payload === 'string' ? { content: payload } : payload
    return api.post<MessageItem>(`/messaging/conversations/${conversationId}/messages`, body)
  }

  async function fetchUnreadCount() {
    return api.get<{ total: number }>('/messaging/unread-count')
  }

  /** Une réaction par personne : en poser une autre remplace la précédente. */
  async function react(messageId: string, emoji: string) {
    return api.post<{ id: string; reactions: MessageItem['reactions'] }>(`/messaging/messages/${messageId}/react`, { emoji })
  }

  async function unreact(messageId: string) {
    return api.delete<{ id: string; reactions: MessageItem['reactions'] }>(`/messaging/messages/${messageId}/react`)
  }

  /** Pose last_read_at à maintenant — 200 sans corps. */
  async function markRead(conversationId: string) {
    return api.patch<void>(`/messaging/conversations/${conversationId}/read`)
  }

  /** Pièce jointe : dépôt via POST /files, puis message `image` / `document` avec `metadata.file_url` (l'API retire l'URL et sert le fichier par /attachment). */
  async function uploadAttachment(file: File, kind: 'image' | 'document') {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('type', kind)
    return api.post<FileUploadResult>('/files', formData)
  }

  /** Fichier protégé, comme les pièces jointes de signalement (IL6) — à passer à useProtectedFile(). */
  function attachmentDownloadUrl(messageId: string) {
    return `${config.public.apiProxyBase}/messaging/messages/${messageId}/attachment`
  }

  return { fetchConversations, createConversation, openConversation, fetchMessages, sendMessage, markRead, fetchUnreadCount, react, unreact, uploadAttachment, attachmentDownloadUrl }
}
