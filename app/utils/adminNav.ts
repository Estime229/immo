import type { Component } from 'vue'
import {
  Building2,
  CreditCard,
  Database,
  FileText,
  Gavel,
  KeyRound,
  LayoutGrid,
  Mail,
  ScrollText,
  Settings,
  ShieldCheck,
  UserX,
  Users,
  Wallet,
  Wrench
} from '@lucide/vue'
import type { Permission } from '~/composables/useAdminLevels'
import type { AdminCounts } from '~/composables/useAdminCounts'

export interface AdminNavItem {
  key: string
  label: string
  to: string
  icon: Component
  /** Une seule suffit pour voir l'entrée. */
  permission?: Permission | Permission[]
  /** Pastille du menu : nombre d'éléments qui attendent une action. */
  count?: keyof AdminCounts
  /** Titre de l'en-tête, s'il diffère du libellé du menu. */
  title?: string
}

/** Menu de l'espace admin, rangé par métier : modérer, gérer les comptes, l'argent, la plateforme. */
export const ADMIN_NAV: Array<{ header: string; items: AdminNavItem[] }> = [
  {
    header: '',
    items: [{ key: 'apercu', label: 'Aperçu', to: '/admin', icon: LayoutGrid, title: 'Aperçu' }]
  },
  {
    header: 'Modération',
    items: [
      { key: 'kyc', label: 'Vérifications KYC', to: '/admin/kyc', icon: ShieldCheck, permission: 'manage:kyc', count: 'kyc' },
      { key: 'biens', label: 'Biens & annonces', to: '/admin/biens', icon: Building2, permission: ['manage:properties', 'view:properties'] },
      { key: 'litiges', label: 'Litiges', to: '/admin/litiges', icon: Gavel, permission: 'manage:leases', count: 'disputes' },
      { key: 'maintenance', label: 'Maintenance', to: '/admin/maintenance', icon: Wrench, permission: 'manage:leases', count: 'maintenance' }
    ]
  },
  {
    header: 'Comptes',
    items: [
      { key: 'utilisateurs', label: 'Utilisateurs', to: '/admin/utilisateurs', icon: Users, permission: ['view:users', 'manage:users'] },
      { key: 'contact', label: 'Messages de contact', to: '/admin/contact', icon: Mail, permission: 'manage:contact', count: 'contact' },
      { key: 'compliance', label: 'Suppressions de compte', to: '/admin/compliance', icon: UserX, permission: 'manage:users', count: 'deletions' }
    ]
  },
  {
    header: 'Finance',
    items: [
      { key: 'wallet', label: 'Retraits & wallets', to: '/admin/wallet', icon: Wallet, permission: 'manage:withdrawals', count: 'withdrawals' },
      { key: 'paiements', label: 'Paiements', to: '/admin/paiements', icon: CreditCard, permission: ['view:payments', 'manage:payments'] },
      { key: 'pdf', label: 'Documents & exports', to: '/admin/pdf', icon: FileText, permission: 'manage:settings' }
    ]
  },
  {
    header: 'Plateforme',
    items: [
      { key: 'referentiels', label: 'Référentiels', to: '/admin/referentiels', icon: Database, permission: ['manage:location', 'manage:currency', 'manage:references'] },
      { key: 'parametres', label: 'Paramètres', to: '/admin/parametres', icon: Settings, permission: 'manage:settings' },
      { key: 'rbac', label: 'Rôles & accès', to: '/admin/rbac', icon: KeyRound, permission: 'manage:rbac' },
      { key: 'audit', label: "Journal d'audit", to: '/admin/audit', icon: ScrollText, permission: 'view:audit' }
    ]
  }
]

const ALL_ITEMS = ADMIN_NAV.flatMap(g => g.items)

/** Entrée du menu correspondant à une route, sous-pages comprises (`/admin/kyc/<id>` → KYC). */
export function adminNavItemFor(path: string): AdminNavItem | undefined {
  const exact = ALL_ITEMS.find(n => n.to === path)
  if (exact) return exact
  return ALL_ITEMS
    .filter(n => n.to !== '/admin' && path.startsWith(`${n.to}/`))
    .sort((a, b) => b.to.length - a.to.length)[0]
}

/** Libellé de pastille : vide si rien n'attend (ou si le nombre est inconnu). */
export function adminCountLabel(n: number | null | undefined): string {
  if (!n) return ''
  return n > 99 ? '99+' : String(n)
}
