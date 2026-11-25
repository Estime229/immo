import type { Component } from 'vue'
import {
  BookOpen,
  Building2,
  CalendarDays,
  CalendarRange,
  ClipboardCheck,
  FolderOpen,
  Handshake,
  LayoutGrid,
  MessageSquare,
  ScrollText,
  TriangleAlert,
  UserRound,
  Users,
  UsersRound,
  Wallet,
  Wrench
} from '@lucide/vue'
import { isProAdvanced, TENANT_TABS, type ProNavItem, type TenantCounts, type TenantTabKey } from '~/utils/proNav'

export interface ProNavEntry extends ProNavItem {
  icon: Component
  label: string
  count: string
}

/**
 * Menu rangé par métier ; le compte (profil, guide) passe en fin de menu, comme dans l'admin.
 *
 * Audit UX : 18 entrées, c'était trop pour un propriétaire qui débute.
 * - Demandes, Visites et Candidatures, trois étapes d'un même parcours, sont
 *   réunies sous « Locataires » ; la page ouvre sur des onglets (ProTenantsTabs).
 * - Équipe, Mandats et Artisans (`advanced`) sont masqués en V1, décision
 *   produit : voir `useProAdvanced()`. Le menu se lit via `visibleNavGroups()`.
 */
export const NAV_GROUPS: ReadonlyArray<{ header: string; items: readonly ProNavEntry[] }> = [
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
      // Ouvre le premier onglet du parcours ; reste allumée sur les deux autres.
      { key: 'locataires', to: TENANT_TABS[0].to, alsoActiveOn: TENANT_TABS.slice(1).map(t => t.to), icon: UsersRound, label: 'Locataires', count: '' },
      { key: 'reservations', to: '/pro/reservations', icon: CalendarDays, label: 'Réservations', count: '' },
      { key: 'baux', to: '/pro/baux', icon: ScrollText, label: 'Baux', count: '' },
      { key: 'edl', to: '/pro/edl', icon: ClipboardCheck, label: 'États des lieux', count: '' }
    ]
  },
  {
    header: 'Équipe et partenaires',
    items: [
      { key: 'equipe', to: '/pro/equipe', icon: Users, label: 'Équipe', count: '', advanced: true },
      { key: 'mandats', to: '/pro/mandats', icon: Handshake, label: 'Mandats', count: '', advanced: true },
      { key: 'artisans', to: '/pro/artisans', icon: Wrench, label: 'Artisans', count: '', advanced: true }
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
]

/**
 * `demandes`, `visites`, `candidatures` restent : le titre d'onglet du
 * navigateur garde le nom de l'onglet ouvert, l'en-tête affiche « Locataires ».
 */
export const PAGE_TITLES: Record<string, string> = {
  apercu: 'Aperçu', profil: 'Profil', guide: 'Guide', biens: 'Mes biens', tarifs: 'Tarifs et disponibilité',
  documents: 'Documents', locataires: 'Locataires', demandes: 'Demandes', visites: 'Visites', candidatures: 'Candidatures',
  reservations: 'Réservations', baux: 'Baux', edl: 'États des lieux', equipe: 'Équipe', mandats: 'Mandats',
  artisans: 'Artisans', wallet: 'Wallet', signalements: 'Signalements', messages: 'Messages',
  addBien: 'Ajouter un bien', newBail: 'Créer un bail', bienFiche: 'Fiche du bien'
}

/**
 * Interrupteur V1 (décision produit) : Équipe, Mandats et Artisans sortent du
 * menu tant que `NUXT_PUBLIC_PRO_ADVANCED` ne vaut pas `true`. Les pages restent
 * accessibles par leur URL — les notifications, alertes et invitations y mènent.
 */
export function useProAdvanced() {
  const config = useRuntimeConfig()
  return computed(() => isProAdvanced(config.public.proAdvanced))
}

/**
 * Compteurs des onglets « Locataires », partagés entre le layout (badge cumulé
 * du menu, chargé une fois) et ProTenantsTabs. Chaque page met à jour le sien
 * après ses propres chargements : une candidature retenue ou une visite
 * confirmée se voit tout de suite dans les onglets, sans rappel de l'API.
 */
export function useProTenantCounts() {
  const counts = useState<TenantCounts>('proTenantCounts', () => ({}))
  function set(key: TenantTabKey, n: number) {
    if (counts.value[key] === n) return
    counts.value = { ...counts.value, [key]: n }
  }
  return { counts, set }
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

