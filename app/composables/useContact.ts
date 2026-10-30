export interface ContactMessage {
  id: string
  name: string
  email: string
  subject?: string | null
  message: string
  handled_at: string | null
  created_at: string
}

export interface ContactMessagesResponse {
  data: ContactMessage[]
  total: number
  page: number
  limit: number
  totalPages: number
}

export interface ContactQuery {
  handled?: boolean
  page?: number
  limit?: number
}

/** Lien « Répondre par email » : l'API n'envoie pas de réponse, l'admin écrit depuis sa messagerie. */
export function contactReplyHref(m: Pick<ContactMessage, 'email' | 'subject'>): string {
  const subject = m.subject?.trim() ? `Re : ${m.subject.trim()}` : 'Votre message à Immo'
  return `mailto:${m.email}?subject=${encodeURIComponent(subject)}`
}

export function useContact() {
  const { apiFetch } = useApi()

  function fetchMessages(query: ContactQuery) {
    return apiFetch<ContactMessagesResponse>('/contact/admin', { query: { ...query } })
  }

  function markHandled(id: string) {
    return apiFetch(`/contact/admin/${id}/handle`, { method: 'PATCH' })
  }

  return { fetchMessages, markHandled }
}
