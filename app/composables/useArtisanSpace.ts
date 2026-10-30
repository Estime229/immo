import type { ArtisanRequestSummary } from '~/types/artisan'
import { BookOpen, Hammer, Handshake, LayoutGrid, ListChecks, MessageSquare, Receipt, Star, UserRound } from '@lucide/vue'

export const ARTISAN_NAV_ITEMS = [
  { key: 'apercu', to: '/artisan', icon: LayoutGrid, label: 'Aperçu', count: '' },
  { key: 'missions', to: '/artisan/missions', icon: Hammer, label: 'Mes missions', count: '' },
  { key: 'planning', to: '/artisan/planning', icon: ListChecks, label: 'À faire', count: '' },
  { key: 'facturation', to: '/artisan/facturation', icon: Receipt, label: 'Facturation', count: '' },
  { key: 'messages', to: '/artisan/messages', icon: MessageSquare, label: 'Messages', count: '' },
  { key: 'partenaires', to: '/artisan/partenaires', icon: Handshake, label: 'Agences partenaires', count: '' },
  { key: 'historique', to: '/artisan/historique', icon: Star, label: 'Avis', count: '' },
  { key: 'profil', to: '/artisan/profil', icon: UserRound, label: 'Profil', count: '' },
  { key: 'guide', to: '/artisan/guide', icon: BookOpen, label: 'Guide', count: '' }
] as const

export const ARTISAN_PAGE_TITLES: Record<string, string> = {
  apercu: 'Aperçu', missions: 'Mes missions', planning: 'À faire', facturation: 'Facturation',
  partenaires: 'Agences partenaires', historique: 'Avis reçus', profil: 'Profil', guide: 'Guide', messages: 'Messages'
}

/* ---- Modales ---- */
export function useArtisanModal() {
  return useState<'' | 'offre' | 'terminer' | 'retrait'>('artisanModal', () => '')
}

/** Demande d'intervention (`ArtisanRequestSummary.id`) ciblée par la modale offre/terminer ouverte. */
export function useArtisanModalTarget() {
  return useState<string | null>('artisanModalTargetId', () => null)
}

/** Instantané de la demande ciblée, pour que la modale « Marquer terminée » rappelle la part retenue sans refetch. */
export function useArtisanModalRequest() {
  return useState<ArtisanRequestSummary | null>('artisanModalRequest', () => null)
}
