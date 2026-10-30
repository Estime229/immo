import type { Permission } from './useAdminLevels'

/**
 * Session admin, bâtie sur l'auth d'Immo (useApiAuth + useAuthApi + useAuthUser) :
 * mêmes jetons, même proxy, même rafraîchissement que les 3 autres espaces.
 * Un compte est « admin » s'il a role === 'admin' ET un admin_level.
 *
 * Tout est résolu de façon synchrone en tête de fonction : un composable appelé après
 * un await perd le contexte Nuxt en SSR (voir nuxt.config.ts, experimental.asyncContext).
 */
export function useAdminAuth() {
  const { accessToken } = useApiAuth()
  const user = useAuthUser()
  const authApi = useAuthApi()
  const loading = useState('admin-auth-loading', () => false)
  const { ensureLoaded: ensureLevelsLoaded, levelDef } = useAdminLevels()

  const level = computed(() => {
    const raw = user.value?.admin_level
    return raw == null || raw === '' ? null : Number(raw)
  })
  const isAdmin = computed(() => user.value?.role === 'admin' && level.value != null && !Number.isNaN(level.value))
  const loggedIn = computed(() => !!accessToken.value && isAdmin.value)

  function resolvePermissions(): Permission[] {
    if (level.value == null) return []
    return levelDef(level.value)?.defaultPermissions ?? []
  }

  const auth = computed(() => ({
    loggedIn: loggedIn.value,
    loading: loading.value,
    adminLevel: level.value,
    nom: user.value ? `${user.value.first_name ?? ''} ${user.value.last_name ?? ''}`.trim() || user.value.email : null,
    permissions: resolvePermissions()
  }))

  async function ensureSession(): Promise<void> {
    if (!accessToken.value) return
    loading.value = true
    try {
      if (!user.value) await authApi.fetchMe()
      if (isAdmin.value) await ensureLevelsLoaded()
    } catch {
      // Une session invalide est déjà effacée par useApi() ; une panne réseau ne déconnecte pas.
    } finally {
      loading.value = false
    }
  }

  async function login(email: string, password: string): Promise<boolean> {
    loading.value = true
    try {
      const outcome = await authApi.login(email, password)
      if (outcome.kind === 'banned') throw new Error(outcome.message)
      if (outcome.kind === 'pending' || !isAdmin.value) {
        // Compte réel mais pas administrateur : on ne garde pas sa session ouverte ici.
        await authApi.logout()
        throw new Error("Ce compte n'a pas d'accès administrateur.")
      }
      await ensureLevelsLoaded()
      return true
    } finally {
      loading.value = false
    }
  }

  async function logout() {
    await authApi.logout()
  }

  function hasPermission(perm: Permission | null | undefined): boolean {
    if (!perm) return true
    if (!loggedIn.value) return false
    const perms = resolvePermissions()
    return perms.includes('manage:all') || perms.includes(perm)
  }

  return { auth, login, logout, hasPermission, ensureSession }
}
