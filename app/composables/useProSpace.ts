export const PRO_PHOTOS = [
  'radial-gradient(120% 80% at 20% 0%, rgba(255,255,255,.42), transparent 58%), linear-gradient(148deg, #cfe3d4, #7fb489 52%, #164c33)',
  'radial-gradient(120% 80% at 20% 0%, rgba(255,255,255,.42), transparent 58%), linear-gradient(148deg, #f5dcc5, #de9c68 52%, #895328)',
  'radial-gradient(120% 80% at 20% 0%, rgba(255,255,255,.4), transparent 58%), linear-gradient(148deg, #e9f1f4, #8fb9c6 52%, #2a6478)',
  'radial-gradient(120% 80% at 20% 0%, rgba(255,255,255,.4), transparent 58%), linear-gradient(148deg, #fce8ec, #e3506b 52%, #8a2440)'
]

export const NAV_GROUPS = [
  {
    header: '',
    items: [
      { key: 'apercu', to: '/pro', icon: '◧', label: 'Aperçu', count: '' },
      { key: 'profil', to: '/pro/profil', icon: '☺', label: 'Profil', count: '' },
      { key: 'guide', to: '/pro/guide', icon: '?', label: 'Guide', count: '' }
    ]
  },
  {
    header: 'Biens',
    items: [
      { key: 'biens', to: '/pro/biens', icon: '⌂', label: 'Mes biens', count: '' },
      { key: 'tarifs', to: '/pro/tarifs', icon: '◷', label: 'Tarifs et disponibilité', count: '' },
      { key: 'documents', to: '/pro/documents', icon: '⎙', label: 'Documents', count: '' }
    ]
  },
  {
    header: 'Activité locative',
    items: [
      { key: 'demandes', to: '/pro/demandes', icon: '✎', label: 'Demandes', count: '1' },
      { key: 'visites', to: '/pro/visites', icon: '⚑', label: 'Visites', count: '' },
      { key: 'reservations', to: '/pro/reservations', icon: '◱', label: 'Réservations', count: '' },
      { key: 'baux', to: '/pro/baux', icon: '⎘', label: 'Baux', count: '1' },
      { key: 'edl', to: '/pro/edl', icon: '☑', label: 'États des lieux', count: '' }
    ]
  },
  {
    header: 'Équipe et partenaires',
    items: [
      { key: 'equipe', to: '/pro/equipe', icon: '⚇', label: 'Équipe', count: '' },
      { key: 'mandats', to: '/pro/mandats', icon: '⚿', label: 'Mandats', count: '1' },
      { key: 'artisans', to: '/pro/artisans', icon: '⚒', label: 'Artisans', count: '' }
    ]
  },
  {
    header: 'Suivi',
    items: [
      { key: 'wallet', to: '/pro/wallet', icon: '⎈', label: 'Wallet', count: '' },
      { key: 'signalements', to: '/pro/signalements', icon: '⚠', label: 'Signalements', count: '1' },
      { key: 'messages', to: '/pro/messages', icon: '✉', label: 'Messages', count: '1' }
    ]
  }
] as const

export const PAGE_TITLES: Record<string, string> = {
  apercu: 'Aperçu', profil: 'Profil', guide: 'Guide', biens: 'Mes biens', tarifs: 'Tarifs et disponibilité',
  documents: 'Documents', demandes: 'Demandes', visites: 'Visites',
  reservations: 'Réservations', baux: 'Baux', edl: 'États des lieux', equipe: 'Équipe', mandats: 'Mandats',
  artisans: 'Artisans', wallet: 'Wallet', signalements: 'Signalements', messages: 'Messages',
  addBien: 'Ajouter un bien', newBail: 'Créer un bail', bienFiche: 'Fiche du bien'
}

export function useProModal() {
  return useState<'' | 'retrait' | 'invite' | 'unite' | 'qr' | 'promo' | 'artisanReq' | 'tarif'>('proModal', () => '')
}

/* ---- Modale flash (confirmation générique) ---- */
export function useFlashModal() {
  const open = useState('proFlashOpen', () => false)
  const title = useState('proFlashTitle', () => '')
  const body = useState('proFlashBody', () => '')
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
