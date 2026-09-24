import { formatFcfa, formatFcfaShort } from './useProperties'

export interface TenantLease {
  id: string
  title: string
  residence: string
  quartier: string
  type: string
  surface: number
  rent: number
  due: string
  late: boolean
  cautionMonths: number
  photo: string
  step: number
  range: string
  bufferHave: number
  bufferMonths: number
  invoices: [string, 'paye' | 'retard'][]
}

const PHOTO_A2 = 'radial-gradient(120% 80% at 20% 0%, rgba(255,255,255,.42), transparent 58%), linear-gradient(148deg, #cfe3d4, #7fb489 52%, #164c33)'
const PHOTO_C4 = 'radial-gradient(120% 80% at 20% 0%, rgba(255,255,255,.4), transparent 58%), linear-gradient(148deg, #e9f1f4, #8fb9c6 52%, #2a6478)'

/** Dégradés de substitution utilisés hors des baux (signalements, messages, demandes, visites, favoris). */
export const TENANT_PHOTOS = [
  'radial-gradient(120% 80% at 20% 0%, rgba(255,255,255,.42), transparent 58%), linear-gradient(148deg, #f5dcc5, #de9c68 52%, #895328)',
  PHOTO_C4,
  'radial-gradient(120% 80% at 20% 0%, rgba(255,255,255,.42), transparent 58%), linear-gradient(148deg, #fce8ec, #e3506b 52%, #8a2440)'
]

export const TENANT_LEASES: TenantLease[] = [
  {
    id: 'a2', title: 'Unité A2', residence: 'Résidence Étoile', quartier: 'Fidjrossè',
    type: '2 chambres salon', surface: 68, rent: 75000, due: '5 sept.', late: true,
    cautionMonths: 2, photo: PHOTO_A2, step: 5, range: 'Du 1er juin 2026 au 31 mai 2027',
    bufferHave: 1, bufferMonths: 2,
    invoices: [['Septembre 2026', 'retard'], ['Août 2026', 'paye'], ['Juillet 2026', 'paye'], ['Juin 2026', 'paye']]
  },
  {
    id: 'c4', title: 'Studio C4', residence: 'Immeuble Zongo', quartier: 'Haie Vive',
    type: 'Studio meublé', surface: 32, rent: 45000, due: '5 sept.', late: false,
    cautionMonths: 1, photo: PHOTO_C4, step: 5, range: 'Du 1er mars 2026 au 28 févr. 2027',
    bufferHave: 3, bufferMonths: 3,
    invoices: [['Septembre 2026', 'paye'], ['Août 2026', 'paye'], ['Juillet 2026', 'paye'], ['Juin 2026', 'paye']]
  }
]

/**
 * `count` laissé vide partout : c'était des valeurs mock figées ('1', '1', '2')
 * jamais reconnectées à une vraie donnée, donc toujours fausses en pratique
 * (ex. « 2 » sur Messages alors qu'il n'y a « Aucune conversation. ») — même
 * choix que le nettoyage équivalent côté artisan (retrait plutôt que
 * fabrication), voir aussi le correctif du même genre sur la cloche de
 * notifications au Lot 9 (`LayoutNotificationBell.vue`, compteur réel).
 */
export const NAV_ITEMS = [
  { key: 'dash', to: '/locataire', icon: '◧', label: 'Tableau de bord', count: '' },
  { key: 'demandes', to: '/locataire/demandes', icon: '✎', label: 'Mes demandes', count: '' },
  { key: 'visites', to: '/locataire/visites', icon: '⚑', label: 'Mes visites', count: '' },
  { key: 'reservations', to: '/locataire/reservations', icon: '⌂', label: 'Mes réservations', count: '' },
  { key: 'bail', to: '/locataire/bail', icon: '⎙', label: 'Mon bail', count: '' },
  { key: 'edl', to: '/locataire/edl', icon: '☑', label: 'État des lieux', count: '' },
  { key: 'wallet', to: '/locataire/wallet', icon: '⎈', label: 'Wallet', count: '' },
  { key: 'signalements', to: '/locataire/signalements', icon: '⚠', label: 'Signalements', count: '' },
  { key: 'favoris', to: '/locataire/favoris', icon: '♥', label: 'Favoris', count: '' },
  { key: 'messages', to: '/locataire/messages', icon: '✉', label: 'Messages', count: '' },
  { key: 'profil', to: '/locataire/profil', icon: '☺', label: 'Profil', count: '' },
  { key: 'guide', to: '/locataire/guide', icon: '?', label: 'Guide', count: '' }
] as const

export function useActiveLease() {
  return useState('tenantActiveLease', () => 0)
}

/** Baux dont l'échéance de septembre vient d'être réglée depuis la modale de paiement. */
export function usePaidLeases() {
  return useState<string[]>('tenantPaidLeases', () => [])
}

export function useTenantSpace() {
  const activeLeaseIndex = useActiveLease()
  const paidLeases = usePaidLeases()
  const activeLease = computed(() => TENANT_LEASES[activeLeaseIndex.value] ?? TENANT_LEASES[0]!)
  const isLate = (lease: TenantLease) => lease.late && !paidLeases.value.includes(lease.id)
  return { leases: TENANT_LEASES, activeLeaseIndex, activeLease, paidLeases, isLate, formatFcfa, formatFcfaShort }
}

/** Laquelle des modales secondaires du bail est ouverte ('' = aucune). */
export function useLeaseModal() {
  return useState<'' | 'preavis' | 'alimenter-avance' | 'alimenter-prepaye' | 'signer-bail'>('tenantLeaseModal', () => '')
}

/* ---- Signalements ---- */
export interface ReportCategory {
  id: string
  label: string
  icon: string
  iconBg: string
}

export const REPORT_CATALOG: ReportCategory[] = [
  { id: 'plomberie', label: 'Plomberie', icon: '⚑', iconBg: 'bg-info-bg' },
  { id: 'electricite', label: 'Électricité', icon: '⚡', iconBg: 'bg-warn-bg' },
  { id: 'serrurerie', label: 'Serrurerie', icon: '⚿', iconBg: 'bg-green-50' },
  { id: 'peinture', label: 'Peinture / murs', icon: '✎', iconBg: 'bg-clay-100' },
  { id: 'electromenager', label: 'Électroménager', icon: '❄', iconBg: 'bg-info-bg' },
  { id: 'autre', label: 'Autre', icon: '⋯', iconBg: 'bg-sand-200' }
]

export function useReportModal() {
  return useState('tenantReportOpen', () => false)
}

export function usePaymentModal() {
  const open = useState('tenantPayOpen', () => false)
  const mode = useState<'loyer' | 'recharge'>('tenantPayMode', () => 'recharge')
  function openPay(m: 'loyer' | 'recharge') {
    mode.value = m
    open.value = true
  }
  function closePay() {
    open.value = false
  }
  return { open, mode, openPay, closePay }
}
