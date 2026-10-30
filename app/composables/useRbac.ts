export interface RbacPermission {
  id: string
  name: string
  description: string
  is_system: boolean
}

export interface RbacRole {
  id: string
  name: string
  description?: string
  is_system: boolean
  permissions: { id: string; name: string }[]
}

export interface RbacRoleInput {
  name: string
  description?: string
  permissionIds: string[]
}

/** Niveau admin tel que renvoyé par `GET /user/admin/levels`, description comprise. */
export interface AdminLevelDetail {
  level: number
  name: string
  description: string
  seederOnly: boolean
  defaultPermissions: string[]
}

interface AdminLevelsResponse {
  levels: Array<{ level: number; name: string; description?: string; seeder_only: boolean; default_permissions: string[] }>
}

export type PermissionDomain = 'total' | 'comptes' | 'verifications' | 'biens' | 'argent' | 'communication' | 'plateforme' | 'autres'

export const PERMISSION_DOMAINS: Array<{ key: PermissionDomain; label: string }> = [
  { key: 'total', label: 'Accès total' },
  { key: 'comptes', label: 'Comptes' },
  { key: 'verifications', label: 'Vérifications' },
  { key: 'biens', label: 'Biens et locations' },
  { key: 'argent', label: 'Argent' },
  { key: 'communication', label: 'Communication' },
  { key: 'plateforme', label: 'Plateforme' },
  { key: 'autres', label: 'Autres permissions' }
]

/** Libellé lisible et domaine de chaque permission connue ; les autres gardent la description de l'API. */
const KNOWN_PERMISSIONS: Record<string, { label: string; domain: PermissionDomain }> = {
  'manage:all': { label: "Tout l'espace admin", domain: 'total' },
  'manage:users': { label: 'Gérer les comptes', domain: 'comptes' },
  'view:users': { label: 'Consulter les comptes', domain: 'comptes' },
  'manage:kyc': { label: 'Valider ou refuser les KYC', domain: 'verifications' },
  'manage:kyb': { label: 'Valider ou refuser les KYB', domain: 'verifications' },
  'manage:properties': { label: 'Gérer les biens', domain: 'biens' },
  'view:properties': { label: 'Consulter les biens', domain: 'biens' },
  'manage:leases': { label: 'Gérer les baux, litiges et maintenance', domain: 'biens' },
  'manage:artisan-disputes': { label: 'Arbitrer les litiges artisans', domain: 'biens' },
  'manage:payments': { label: 'Gérer les passerelles de paiement', domain: 'argent' },
  'view:payments': { label: 'Consulter les paiements', domain: 'argent' },
  'manage:withdrawals': { label: 'Valider ou refuser les retraits', domain: 'argent' },
  'manage:currency': { label: 'Gérer les devises et taux', domain: 'argent' },
  'manage:messaging': { label: 'Modérer la messagerie', domain: 'communication' },
  'manage:notifications': { label: 'Gérer les notifications', domain: 'communication' },
  'manage:contact': { label: 'Traiter les messages de contact', domain: 'communication' },
  'manage:settings': { label: 'Modifier les paramètres', domain: 'plateforme' },
  'manage:references': { label: 'Gérer les référentiels', domain: 'plateforme' },
  'manage:location': { label: 'Gérer pays, villes et quartiers', domain: 'plateforme' },
  'manage:rbac': { label: 'Gérer les rôles et accès', domain: 'plateforme' },
  'view:audit': { label: "Consulter le journal d'audit", domain: 'plateforme' },
  'view:stats': { label: 'Consulter les statistiques', domain: 'plateforme' }
}

export function permissionLabel(name: string, description?: string): string {
  return KNOWN_PERMISSIONS[name]?.label ?? (description && description !== name ? description : name)
}

export function permissionDomain(name: string): PermissionDomain {
  return KNOWN_PERMISSIONS[name]?.domain ?? 'autres'
}

/** Permissions rangées par domaine, dans l'ordre de PERMISSION_DOMAINS ; les domaines vides sont omis. */
export function groupRbacPermissions<T extends { name: string }>(permissions: T[]) {
  return PERMISSION_DOMAINS
    .map(d => ({ ...d, items: permissions.filter(p => permissionDomain(p.name) === d.key) }))
    .filter(d => d.items.length)
}

export function useRbac() {
  const { apiFetch } = useApi()

  function fetchRoles() {
    return apiFetch<RbacRole[]>('/rbac/roles')
  }

  function fetchPermissions() {
    return apiFetch<RbacPermission[]>('/rbac/permissions')
  }

  function createRole(data: RbacRoleInput) {
    return apiFetch<RbacRole>('/rbac/roles', { method: 'POST', body: data })
  }

  function updateRole(id: string, data: Partial<RbacRoleInput>) {
    return apiFetch<RbacRole>(`/rbac/roles/${id}`, { method: 'PATCH', body: data })
  }

  function deleteRole(id: string) {
    return apiFetch(`/rbac/roles/${id}`, { method: 'DELETE' })
  }

  /** Registre des niveaux admin avec leur description (useAdminLevels ne garde que nom et permissions). */
  async function fetchAdminLevels(): Promise<AdminLevelDetail[]> {
    const res = await apiFetch<AdminLevelsResponse>('/user/admin/levels')
    return res.levels.map(l => ({
      level: l.level,
      name: l.name,
      description: l.description ?? '',
      seederOnly: l.seeder_only,
      defaultPermissions: l.default_permissions
    }))
  }

  return { fetchRoles, fetchPermissions, createRole, updateRole, deleteRole, fetchAdminLevels }
}
