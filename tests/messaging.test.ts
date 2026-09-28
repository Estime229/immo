import { describe, expect, it } from 'vitest'
import { attachmentKind, findConversation, formatUnread, mergeMessages, myReaction, newIncoming, quoteExcerpt, reactionChips, validateAttachment } from '../app/utils/messaging'
import type { ConversationSummary, MessageItem } from '../app/types/messaging'

const msg = (id: string, at: string, sender = 'other', over: Partial<MessageItem> = {}): MessageItem => ({ id, conversation_id: 'c', sender_id: sender, content: id, type: 'text', metadata: null, created_at: at, sender: { id: sender }, ...over })

describe('fusion des messages (sondage, pages précédentes)', () => {
  it('déduplique et remet dans l\'ordre chronologique', () => {
    const current = [msg('m2', '2026-09-28T09:40:22Z'), msg('m3', '2026-09-28T09:40:26Z')]
    const older = [msg('m0', '2026-09-28T09:40:10Z'), msg('m1', '2026-09-28T09:40:18Z')]
    expect(mergeMessages(current, older).map(m => m.id)).toEqual(['m0', 'm1', 'm2', 'm3'])
    expect(mergeMessages(current, [msg('m3', '2026-09-28T09:40:26Z', 'other', { reactions: [{ user_id: 'u', emoji: '👍', created_at: '' }] })])[1]?.reactions?.length).toBe(1)
  })
  it('compte les nouveaux messages reçus, pas les miens', () => {
    const current = [msg('m1', '2026-09-28T09:00:00Z')]
    expect(newIncoming(current, [msg('m1', '2026-09-28T09:00:00Z'), msg('m2', '2026-09-28T09:01:00Z'), msg('m3', '2026-09-28T09:02:00Z', 'me')], 'me')).toBe(1)
  })
})

describe('réactions', () => {
  const reactions = [{ user_id: 'me', emoji: '👍', created_at: '' }, { user_id: 'x', emoji: '👍', created_at: '' }, { user_id: 'y', emoji: '❤️', created_at: '' }]
  it('regroupe par emoji et repère la mienne', () => {
    expect(reactionChips(reactions, 'me')).toEqual([{ emoji: '👍', count: 2, mine: true }, { emoji: '❤️', count: 1, mine: false }])
    expect(myReaction(reactions, 'me')).toBe('👍')
    expect(myReaction(reactions, 'z')).toBeNull()
    expect(reactionChips(undefined, 'me')).toEqual([])
  })
})

describe('conversations (#92)', () => {
  const conv = (id: string, unit: string, who: string, status: ConversationSummary['status'] = 'active'): ConversationSummary => ({
    id, rental_request_id: null, status, created_at: '', updated_at: '', unit: { id: unit, name: 'U' }, property: null, last_message: null, unread_count: 0,
    participants: [{ id: 'p1', user_id: 'me', role: 'tenant', joined_at: '', last_read_at: null, user: { id: 'me' } }, { id: 'p2', user_id: who, role: 'landlord', joined_at: '', last_read_at: null, user: { id: who } }]
  })
  it('réutilise la conversation active du même logement avec la même personne', () => {
    const list = [conv('a', 'u1', 'l1', 'closed'), conv('b', 'u1', 'l1'), conv('c', 'u2', 'l1')]
    expect(findConversation(list, 'u1', 'l1')?.id).toBe('b')
    expect(findConversation(list, 'u1', 'l2')).toBeNull()
  })
})

describe('pièces jointes et affichage', () => {
  it('classe et limite les fichiers', () => {
    expect(attachmentKind({ type: 'image/png' })).toBe('image')
    expect(attachmentKind({ type: 'application/pdf' })).toBe('document')
    expect(validateAttachment({ size: 11 * 1024 * 1024, type: 'image/png' })).toContain('10 Mo')
    expect(validateAttachment({ size: 1000, type: 'application/zip' })).toContain('Formats')
    expect(validateAttachment({ size: 1000, type: 'application/pdf' })).toBeNull()
  })
  it('résume un message cité', () => {
    expect(quoteExcerpt({ content: 'fuite.png', type: 'image' })).toBe('📷 fuite.png')
    expect(quoteExcerpt({ content: 'x'.repeat(120), type: 'text' }, 20)).toHaveLength(20)
    expect(quoteExcerpt(null)).toBe('Message supprimé')
  })
  it('borne le compteur de non-lus', () => {
    expect(formatUnread(0)).toBe('')
    expect(formatUnread(7)).toBe('7')
    expect(formatUnread(150)).toBe('99+')
  })
})
