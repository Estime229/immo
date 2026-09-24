export const ARTISAN_NAV_ITEMS = [
  { key: 'apercu', to: '/artisan', icon: '◧', label: 'Aperçu', count: '' },
  { key: 'missions', to: '/artisan/missions', icon: '⚒', label: 'Mes missions', count: '' },
  { key: 'planning', to: '/artisan/planning', icon: '◷', label: 'Planning', count: '' },
  { key: 'facturation', to: '/artisan/facturation', icon: '⎈', label: 'Facturation', count: '' },
  { key: 'partenaires', to: '/artisan/partenaires', icon: '⚇', label: 'Agences partenaires', count: '' },
  { key: 'historique', to: '/artisan/historique', icon: '★', label: 'Historique', count: '' },
  { key: 'profil', to: '/artisan/profil', icon: '☺', label: 'Profil', count: '' },
  { key: 'guide', to: '/artisan/guide', icon: '?', label: 'Guide', count: '' }
] as const

export const ARTISAN_PAGE_TITLES: Record<string, string> = {
  apercu: 'Aperçu', missions: 'Mes missions', planning: 'Planning', facturation: 'Facturation',
  partenaires: 'Agences partenaires', historique: 'Historique et avis', profil: 'Profil', guide: 'Guide'
}

/* ---- Disponibilité (local uniquement — aucun endpoint ne le persiste) ---- */
export function useArtisanDispo() {
  return useState('artisanDispo', () => true)
}

/* ---- Modales ---- */
export function useArtisanModal() {
  return useState<'' | 'offre' | 'terminer' | 'retrait' | 'bloquer'>('artisanModal', () => '')
}

/** Demande d'intervention (`ArtisanRequestSummary.id`) ciblée par la modale offre/terminer ouverte. */
export function useArtisanModalTarget() {
  return useState<string | null>('artisanModalTargetId', () => null)
}

export function useArtisanFlashModal() {
  const open = useState('artisanFlashOpen', () => false)
  const title = useState('artisanFlashTitle', () => '')
  const body = useState('artisanFlashBody', () => '')
  function flash(t: string, b: string) {
    title.value = t
    body.value = b
    open.value = true
  }
  function close() {
    open.value = false
  }
  return { open, title, body, flash, close }
}
