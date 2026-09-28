import type { ConversationSummary, MessageItem, MessageReaction } from '../types/messaging'

/**
 * Messagerie (Lot 55). Vérifié en live : la page 1 de
 * GET /messaging/conversations/:id/messages contient les messages les plus
 * récents (triés du plus ancien au plus récent dans la page), la page 2 les
 * précédents — la doc dit « oldest first », ce qui est vrai dans une page
 * seulement.
 */

/** Fusion sans doublon (sondage, page précédente, message envoyé) — ordre chronologique. */
export function mergeMessages(current: MessageItem[], incoming: MessageItem[]): MessageItem[] {
  const byId = new Map<string, MessageItem>()
  for (const m of current) byId.set(m.id, m)
  for (const m of incoming) byId.set(m.id, m)
  return [...byId.values()].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
}

/** Messages reçus (pas les miens) absents de la liste actuelle — pour savoir s'il faut marquer lu. */
export function newIncoming(current: MessageItem[], incoming: MessageItem[], me: string | null | undefined): number {
  const known = new Set(current.map(m => m.id))
  return incoming.filter(m => !known.has(m.id) && m.sender_id !== me).length
}

export interface ReactionChip { emoji: string; count: number; mine: boolean }

export function reactionChips(reactions: MessageReaction[] | undefined, me: string | null | undefined): ReactionChip[] {
  const chips = new Map<string, ReactionChip>()
  for (const r of reactions ?? []) {
    const chip = chips.get(r.emoji) ?? { emoji: r.emoji, count: 0, mine: false }
    chip.count++
    if (r.user_id === me) chip.mine = true
    chips.set(r.emoji, chip)
  }
  return [...chips.values()]
}

export function myReaction(reactions: MessageReaction[] | undefined, me: string | null | undefined): string | null {
  return (reactions ?? []).find(r => r.user_id === me)?.emoji ?? null
}

export const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '🙏', '✅'] as const

/**
 * L'API crée une nouvelle conversation à chaque appel pour le même logement et
 * le même destinataire (#92) : on réutilise la conversation active existante.
 */
export function findConversation(list: ConversationSummary[], unitId: string, recipientId: string): ConversationSummary | null {
  return list.find(c => c.status === 'active' && c.unit?.id === unitId && c.participants.some(p => p.user_id === recipientId)) ?? null
}

export function attachmentKind(file: Pick<File, 'type'>): 'image' | 'document' {
  return file.type.startsWith('image/') ? 'image' : 'document'
}

export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024

export function validateAttachment(file: Pick<File, 'size' | 'type'>): string | null {
  if (file.size > ATTACHMENT_MAX_BYTES) return 'Fichier trop lourd : 10 Mo au maximum.'
  if (!file.type.startsWith('image/') && file.type !== 'application/pdf') return 'Formats acceptés : photo ou PDF.'
  return null
}

/** Extrait d'un message cité (réponse). */
export function quoteExcerpt(m: Pick<MessageItem, 'content' | 'type'> | null | undefined, max = 90): string {
  if (!m) return 'Message supprimé'
  const text = m.type === 'image' ? `📷 ${m.content || 'Photo'}` : m.type === 'document' ? `📎 ${m.content || 'Document'}` : m.content
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

export function formatUnread(n: number): string {
  return n > 0 ? (n > 99 ? '99+' : String(n)) : ''
}
