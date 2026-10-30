import {
  BookOpen,
  Building2,
  CalendarClock,
  CalendarDays,
  CalendarRange,
  ClipboardCheck,
  FileText,
  FolderOpen,
  Handshake,
  LayoutGrid,
  Megaphone,
  MessageSquare,
  ScrollText,
  TriangleAlert,
  UserRound,
  Users,
  Wallet,
  Wrench
} from '@lucide/vue'

export const PRO_PHOTOS = [
  'radial-gradient(120% 80% at 20% 0%, rgba(255,255,255,.42), transparent 58%), linear-gradient(148deg, #cfe3d4, #7fb489 52%, #164c33)',
  'radial-gradient(120% 80% at 20% 0%, rgba(255,255,255,.42), transparent 58%), linear-gradient(148deg, #f5dcc5, #de9c68 52%, #895328)',
  'radial-gradient(120% 80% at 20% 0%, rgba(255,255,255,.4), transparent 58%), linear-gradient(148deg, #e9f1f4, #8fb9c6 52%, #2a6478)',
  'radial-gradient(120% 80% at 20% 0%, rgba(255,255,255,.4), transparent 58%), linear-gradient(148deg, #fce8ec, #e3506b 52%, #8a2440)'
]

/** Menu rangé par métier ; le compte (profil, guide) passe en fin de menu, comme dans l'admin. */
export const NAV_GROUPS = [
  {
    header: '',
    items: [
      { key: 'apercu', to: '/pro', icon: LayoutGrid, label: 'Aperçu', count: '' }
    ]
  },
  {
    header: 'Biens',
    items: [
      { key: 'biens', to: '/pro/biens', icon: Building2, label: 'Mes biens', count: '' },
      { key: 'tarifs', to: '/pro/tarifs', icon: CalendarRange, label: 'Tarifs et disponibilité', count: '' },
      { key: 'documents', to: '/pro/documents', icon: FolderOpen, label: 'Documents', count: '' }
    ]
  },
  {
    header: 'Activité locative',
    items: [
      { key: 'demandes', to: '/pro/demandes', icon: Megaphone, label: 'Demandes', count: '' },
      { key: 'visites', to: '/pro/visites', icon: CalendarClock, label: 'Visites', count: '' },
      { key: 'candidatures', to: '/pro/candidatures', icon: FileText, label: 'Candidatures', count: '' },
      { key: 'reservations', to: '/pro/reservations', icon: CalendarDays, label: 'Réservations', count: '' },
      { key: 'baux', to: '/pro/baux', icon: ScrollText, label: 'Baux', count: '' },
      { key: 'edl', to: '/pro/edl', icon: ClipboardCheck, label: 'États des lieux', count: '' }
    ]
  },
  {
    header: 'Équipe et partenaires',
    items: [
      { key: 'equipe', to: '/pro/equipe', icon: Users, label: 'Équipe', count: '' },
      { key: 'mandats', to: '/pro/mandats', icon: Handshake, label: 'Mandats', count: '' },
      { key: 'artisans', to: '/pro/artisans', icon: Wrench, label: 'Artisans', count: '' }
    ]
  },
  {
    header: 'Suivi',
    items: [
      { key: 'wallet', to: '/pro/wallet', icon: Wallet, label: 'Wallet', count: '' },
      { key: 'signalements', to: '/pro/signalements', icon: TriangleAlert, label: 'Signalements', count: '' },
      { key: 'messages', to: '/pro/messages', icon: MessageSquare, label: 'Messages', count: '' }
    ]
  },
  {
    header: 'Compte',
    items: [
      { key: 'profil', to: '/pro/profil', icon: UserRound, label: 'Profil', count: '' },
      { key: 'guide', to: '/pro/guide', icon: BookOpen, label: 'Guide', count: '' }
    ]
  }
] as const

export const PAGE_TITLES: Record<string, string> = {
  apercu: 'Aperçu', profil: 'Profil', guide: 'Guide', biens: 'Mes biens', tarifs: 'Tarifs et disponibilité',
  documents: 'Documents', demandes: 'Demandes', visites: 'Visites', candidatures: 'Candidatures',
  reservations: 'Réservations', baux: 'Baux', edl: 'États des lieux', equipe: 'Équipe', mandats: 'Mandats',
  artisans: 'Artisans', wallet: 'Wallet', signalements: 'Signalements', messages: 'Messages',
  addBien: 'Ajouter un bien', newBail: 'Créer un bail', bienFiche: 'Fiche du bien'
}

export function useProModal() {
  return useState<'' | 'retrait' | 'invite' | 'unite' | 'promo' | 'artisanReq' | 'payerIntervention'>('proModal', () => '')
}

/** Demande d'intervention (`ArtisanRequestSummary.id`) ciblée par la modale de paiement — même motif que `useArtisanModalTarget()`. */
export function useProModalTarget() {
  return useState<string | null>('proModalTargetId', () => null)
}

/**
 * Signalement d'origine d'une demande d'intervention (Lot 54) : la modale
 * « Demander une intervention » arrive pré-remplie (logement, description) et,
 * une fois la demande créée, fait passer le signalement « En examen » avec
 * l'artisan en assigné. `signalId` est aussi envoyé dans `POST /artisan-requests`
 * (audit UX, migration 014) : l'API relie les deux et transmet les photos du
 * signalement à l'artisan, en plus de son texte déjà repris dans `description`.
 */
export function useArtisanReqPrefill() {
  return useState<{ unitId: string; description: string; signalId: string; signalStatus: string } | null>('artisanReqPrefill', () => null)
}

