import type { UserRole } from '~/types/auth'
import { roleHomePath, spaceAccess, spaceOf, SPACE_ROLES } from '~/utils/roleRoutes'

const PROTECTED_PREFIXES = ['/locataire', '/pro', '/artisan', '/kyc']

/**
 * Sans cette garde, `/locataire`, `/pro`, `/artisan` et `/kyc` se chargeaient
 * quand même sans session (ou avec un jeton invalide) : toute la structure de
 * la page s'affichait, et chaque bloc de données échouait individuellement en
 * 401 avec un message générique trompeur au lieu d'une redirection claire
 * vers la connexion — voir TEST-CASES.md, AUTH-08/SYS-04.
 *
 * `fetchMe()` peut légitimement renvoyer `null` sans lever d'erreur (compte
 * tout juste créé, profil pas encore finalisé côté backend — voir
 * useAuthApi.ts) : ce n'est pas un échec d'authentification, donc ce cas ne
 * doit jamais rediriger vers `/connexion`. Seul un rejet réel (401 après
 * l'échec du rafraîchissement, jetons déjà effacés par `useApi()` à ce
 * moment-là) doit rediriger.
 */
export default defineNuxtRouteMiddleware(async to => {
  if (!PROTECTED_PREFIXES.some(p => to.path === p || to.path.startsWith(`${p}/`))) return

  // Lot 56 : la page demandée est gardée (`?redirect=`), sinon un lien de notification,
  // d'e-mail ou de conversation ramenait à l'accueil de l'espace après la connexion.
  const toLogin = () => navigateTo({ path: '/connexion', query: { redirect: to.fullPath } })

  const { accessToken } = useApiAuth()
  if (!accessToken.value) {
    return toLogin()
  }

  const { user, fetchMe, fetchRoles, switchRole } = useAuthApi()
  if (!user.value) {
    try {
      await fetchMe()
    } catch {
      return toLogin()
    }
  }

  // Lot 56 : espace pro ou artisan sans le rôle actif correspondant → bascule ou retour dans son espace.
  const u = user.value
  const space = spaceOf(to.path)
  if (!u || !space || u.role === 'admin') return
  if (space !== 'locataire' && SPACE_ROLES[space].includes(u.role)) return
  const roles = useState<UserRole[] | null>('authRoles', () => null)
  if (!roles.value && space !== 'locataire') {
    try {
      roles.value = (await fetchRoles()).roles
    } catch {
      roles.value = [u.role]
    }
  }
  const access = spaceAccess(to.path, u.role, roles.value ?? [u.role])
  if (access.action === 'switch') {
    try {
      await switchRole(access.role)
    } catch {
      return navigateTo(roleHomePath(u.role), { replace: true })
    }
    return
  }
  if (access.action === 'redirect') return navigateTo({ path: access.path, query: access.keepQuery ? to.query : undefined }, { replace: true })
})
