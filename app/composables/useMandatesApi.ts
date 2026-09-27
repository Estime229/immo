import type { Mandate } from '~/types/team'

/**
 * Mandats d'agent (`/agent-mandates`). Créer : propriétaire ou agence (une
 * agence doit avoir son KYB approuvé). Répondre : l'agent. Mettre fin : l'une
 * ou l'autre partie. Désigner l'agent d'un bien passe par `PATCH /property/:id`
 * (`agent_id`), accepté seulement avec un mandat actif — sans effet sur les accès (#76).
 */
export function useMandatesApi() {
  const api = useApi()
  return {
    managed: () => api.get<Mandate[]>('/agent-mandates/managed'),
    mine: () => api.get<Mandate[]>('/agent-mandates/mine'),
    create: (payload: { agent_email?: string; agent_phone_number?: string }) => api.post<Mandate>('/agent-mandates', payload),
    respond: (id: string, action: 'accept' | 'reject') => api.patch<Mandate>(`/agent-mandates/${id}/respond`, { action }),
    revoke: (id: string) => api.patch<Mandate>(`/agent-mandates/${id}/revoke`),
    assignAgent: (propertyId: string, agentId: string | null) => api.patch(`/property/${propertyId}`, { agent_id: agentId })
  }
}
