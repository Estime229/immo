import {
  BookOpen,
  CalendarClock,
  CalendarDays,
  ClipboardCheck,
  FileText,
  Heart,
  KeyRound,
  LayoutGrid,
  Megaphone,
  MessageSquare,
  TriangleAlert,
  UserRound,
  Wallet
} from '@lucide/vue'

import type { Component } from 'vue'
import { Building2, Droplets, Ellipsis, PaintRoller, Refrigerator, Users, Volume2, Zap } from '@lucide/vue'

/**
 * `count` laissé vide partout : c'était des valeurs mock figées ('1', '1', '2')
 * jamais reconnectées à une vraie donnée, donc toujours fausses en pratique
 * (ex. « 2 » sur Messages alors qu'il n'y a « Aucune conversation. ») — même
 * choix que le nettoyage équivalent côté artisan (retrait plutôt que
 * fabrication), voir aussi le correctif du même genre sur la cloche de
 * notifications au Lot 9 (`LayoutNotificationBell.vue`, compteur réel).
 */
export const NAV_ITEMS = [
  { key: 'dash', to: '/locataire', icon: LayoutGrid, group: '', label: 'Tableau de bord', count: '' },
  { key: 'bail', to: '/locataire/bail', icon: KeyRound, group: 'Mon logement', label: 'Mon bail', count: '' },
  { key: 'reservations', to: '/locataire/reservations', icon: CalendarDays, group: 'Mon logement', label: 'Mes réservations', count: '' },
  { key: 'edl', to: '/locataire/edl', icon: ClipboardCheck, group: 'Mon logement', label: 'État des lieux', count: '' },
  { key: 'signalements', to: '/locataire/signalements', icon: TriangleAlert, group: 'Mon logement', label: 'Signalements', count: '' },
  { key: 'demandes', to: '/locataire/demandes', icon: Megaphone, group: 'Ma recherche', label: 'Mes demandes', count: '' },
  { key: 'visites', to: '/locataire/visites', icon: CalendarClock, group: 'Ma recherche', label: 'Mes visites', count: '' },
  { key: 'candidatures', to: '/locataire/candidatures', icon: FileText, group: 'Ma recherche', label: 'Mes candidatures', count: '' },
  { key: 'favoris', to: '/locataire/favoris', icon: Heart, group: 'Ma recherche', label: 'Favoris', count: '' },
  { key: 'wallet', to: '/locataire/wallet', icon: Wallet, group: 'Compte', label: 'Wallet', count: '' },
  { key: 'messages', to: '/locataire/messages', icon: MessageSquare, group: 'Compte', label: 'Messages', count: '' },
  { key: 'profil', to: '/locataire/profil', icon: UserRound, group: 'Compte', label: 'Profil', count: '' },
  { key: 'guide', to: '/locataire/guide', icon: BookOpen, group: 'Compte', label: 'Guide', count: '' }
] as const

/** Menu groupé par usage : ce qui concerne le logement occupé, la recherche d'un logement, puis le compte. */
export const NAV_SECTIONS = ['', 'Mon logement', 'Ma recherche', 'Compte'].map(header => ({
  header,
  items: NAV_ITEMS.filter(n => n.group === header)
}))

/** Laquelle des modales secondaires du bail est ouverte ('' = aucune). */
export function useLeaseModal() {
  return useState<'' | 'preavis' | 'alimenter-avance' | 'alimenter-prepaye' | 'signer-bail'>('tenantLeaseModal', () => '')
}

/**
 * Compte rendu de la dernière action menée depuis une modale du bail (signature,
 * préavis, tampon) : les modales vivent dans la mise en page, l'écran du bail
 * l'affiche en bandeau une fois la modale fermée, avec l'étape suivante.
 */
export function useLeaseFlash() {
  return useState<{ leaseId: string; text: string; next?: { label: string; to: string } } | null>('tenantLeaseFlash', () => null)
}

/* ---- Signalements ---- */
export interface ReportCategory {
  id: string
  label: string
  icon: Component
  iconBg: string
}

/** `maintenance` : propose la pièce concernée. Lot 55 : l'API a 13 types, l'écran n'en couvrait que les pannes. */
export const REPORT_CATALOG: (ReportCategory & { maintenance: boolean })[] = [
  { id: 'plomberie', label: 'Plomberie', icon: Droplets, iconBg: 'bg-info-bg text-info-fg', maintenance: true },
  { id: 'electricite', label: 'Électricité', icon: Zap, iconBg: 'bg-warn-bg text-warn-fg', maintenance: true },
  { id: 'serrurerie', label: 'Serrurerie', icon: KeyRound, iconBg: 'bg-green-50 text-green-700', maintenance: true },
  { id: 'peinture', label: 'Peinture / murs', icon: PaintRoller, iconBg: 'bg-clay-100 text-clay-700', maintenance: true },
  { id: 'electromenager', label: 'Équipement', icon: Refrigerator, iconBg: 'bg-info-bg text-info-fg', maintenance: true },
  { id: 'parties_communes', label: 'Parties communes', icon: Building2, iconBg: 'bg-green-50 text-green-700', maintenance: false },
  { id: 'nuisance', label: 'Nuisance sonore', icon: Volume2, iconBg: 'bg-warn-bg text-warn-fg', maintenance: false },
  { id: 'voisinage', label: 'Voisinage', icon: Users, iconBg: 'bg-clay-100 text-clay-700', maintenance: false },
  { id: 'insalubrite', label: 'Insalubrité', icon: TriangleAlert, iconBg: 'bg-danger-bg text-danger-fg', maintenance: false },
  { id: 'autre', label: 'Autre', icon: Ellipsis, iconBg: 'bg-sand-200 text-[var(--text-secondary)]', maintenance: false }
]

export function useReportModal() {
  return useState('tenantReportOpen', () => false)
}

export function usePaymentModal() {
  const open = useState('tenantPayOpen', () => false)
  const mode = useState<'loyer' | 'recharge'>('tenantPayMode', () => 'recharge')
  /** Facture visée par « Payer » (Lot 50) — sans elle, la plus ancienne encore due. */
  const invoiceId = useState<string | null>('tenantPayInvoiceId', () => null)
  function openPay(m: 'loyer' | 'recharge', targetInvoiceId: string | null = null) {
    mode.value = m
    invoiceId.value = targetInvoiceId
    open.value = true
  }
  function closePay() {
    open.value = false
  }
  return { open, mode, invoiceId, openPay, closePay }
}
