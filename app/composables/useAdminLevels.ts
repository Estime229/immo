export type Permission =
  | 'manage:all'
  | 'manage:users'
  | 'manage:rbac'
  | 'manage:kyc'
  | 'manage:kyb'
  | 'manage:settings'
  | 'manage:properties'
  | 'manage:leases'
  | 'manage:artisan-disputes'
  | 'manage:payments'
  | 'manage:withdrawals'
  | 'manage:messaging'
  | 'manage:notifications'
  | 'manage:references'
  | 'manage:location'
  | 'manage:currency'
  | 'manage:contact'
  | 'view:audit'
  | 'view:users'
  | 'view:properties'
  | 'view:payments'
  | 'view:stats'

export interface AdminLevelDef {
  level: number
  name: string
  seederOnly: boolean
  defaultPermissions: Permission[]
}

interface AdminLevelsResponse {
  levels: Array<{
    level: number
    name: string
    seeder_only: boolean
    default_permissions: Permission[]
  }>
}

export function useAdminLevels() {
  const levels = useState<AdminLevelDef[]>('admin-levels-registry', () => [])
  const loading = useState('admin-levels-loading', () => false)

  async function ensureLoaded() {
    if (levels.value.length || loading.value) return
    loading.value = true
    try {
      const { apiFetch } = useApi()
      const res = await apiFetch<AdminLevelsResponse>('/user/admin/levels')
      levels.value = res.levels.map(l => ({
        level: l.level,
        name: l.name,
        seederOnly: l.seeder_only,
        defaultPermissions: l.default_permissions
      }))
    } finally {
      loading.value = false
    }
  }

  function levelDef(level: number) {
    return levels.value.find(l => l.level === level)
  }

  return { levels, loading, ensureLoaded, levelDef }
}
