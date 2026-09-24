/**
 * Types pour la messagerie (IL7). Écrits à partir des schémas Swagger
 * (`ConversationResponseDto`, `MessageResponseDto`, `PaginatedMessagesResponseDto`)
 * — contrairement au reste du projet, ce module a des schémas `properties`
 * complets, pas seulement des `example` en vrac.
 */

export type ConversationStatus = 'active' | 'archived' | 'closed'
export type MessageType = 'text' | 'system' | 'image' | 'document'
/**
 * 4 valeurs déclarées au Swagger (tenant/landlord/agent/admin) mais `agency`
 * observé en direct sur une conversation réelle — élargi à `string` pour ne
 * pas fabriquer une énumération plus stricte que la réalité (voir IL7).
 */
export type ParticipantRole = 'tenant' | 'landlord' | 'agent' | 'admin' | 'agency' | (string & {})

export interface ParticipantUser {
  id: string
  first_name?: string
  last_name?: string
  avatar_url?: string
}

export interface Participant {
  id: string
  user_id: string
  role: ParticipantRole
  joined_at: string
  last_read_at: string | null
  user: ParticipantUser
}

export interface LastMessage {
  id: string
  content: string
  type: MessageType
  created_at: string
  sender: ParticipantUser
}

export interface ConversationSummary {
  id: string
  rental_request_id: string | null
  status: ConversationStatus
  created_at: string
  updated_at: string
  participants: Participant[]
  unit: { id: string; name: string; price?: string } | null
  property: { id: string; name: string } | null
  last_message: LastMessage | null
  unread_count: number
}

export interface MessageItem {
  id: string
  conversation_id: string
  sender_id: string
  content: string
  type: MessageType
  metadata: Record<string, unknown> | null
  created_at: string
  sender: ParticipantUser
}

export interface MessagesPage {
  data: MessageItem[]
  total: number
  page: number
  limit: number
  totalPages: number
}
