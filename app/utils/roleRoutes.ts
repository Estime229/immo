import type { UserRole } from '~/types/auth'

/** Espace de chaque rôle réel — même correspondance que la redirection post-connexion (voir connexion.vue). */
export const ROLE_ROUTES: Record<UserRole, string> = {
  tenant: '/locataire',
  landlord: '/pro',
  agent: '/pro',
  agency: '/pro',
  artisan: '/artisan',
  admin: '/'
}

export function roleHomePath(role: UserRole): string {
  return ROLE_ROUTES[role] ?? '/'
}

/** Libellés FR déjà utilisés isolément dans pro/messages.vue et le layout pro — centralisés ici. */
export const ROLE_LABELS: Record<UserRole, string> = {
  tenant: 'Locataire',
  landlord: 'Propriétaire',
  agent: 'Agent',
  agency: 'Agence',
  artisan: 'Artisan',
  admin: 'Admin'
}

export function roleLabel(role: UserRole): string {
  return ROLE_LABELS[role] ?? role
}

/* ---- Garde des espaces (Lot 56) ---- */
export type Space = 'locataire' | 'pro' | 'artisan'

/** Rôles qui ouvrent chaque espace. Un compte à plusieurs rôles garde l'accès à chacun de ses espaces. */
export const SPACE_ROLES: Record<Space, UserRole[]> = {
  locataire: ['tenant'],
  pro: ['landlord', 'agent', 'agency'],
  artisan: ['artisan']
}

export function spaceOf(path: string): Space | null {
  const m = /^\/(locataire|pro|artisan)(\/|$)/.exec(path)
  return m ? (m[1] as Space) : null
}

export type SpaceAccess =
  | { action: 'ok' }
  | { action: 'switch'; role: UserRole }
  | { action: 'redirect'; path: string; keepQuery: boolean }

/**
 * Accès à un espace connecté (Lot 56). Avant, rien n'était vérifié : un
 * locataire voyait un tableau de bord pro vide et des erreurs 403/500, un
 * artisan un espace pro.
 * - L'espace locataire reste ouvert à tous : un propriétaire peut aussi louer
 *   sans que l'API lui ait donné le rôle `tenant` (constaté sur un compte de test).
 * - Pro et artisan exigent le rôle. Un compte qui l'a sans qu'il soit actif y
 *   bascule (sinon l'API répond 403, #78) ; un compte qui ne l'a pas retourne
 *   dans son espace.
 * - La messagerie est commune à tous les rôles : un lien vers une conversation
 *   (fiche d'un logement, vitrine, notification) mène à celle de son espace.
 */
export function spaceAccess(path: string, activeRole: UserRole, roles: UserRole[]): SpaceAccess {
  const space = spaceOf(path)
  if (!space || activeRole === 'admin') return { action: 'ok' }
  const home = roleHomePath(activeRole)
  if (space === 'locataire') {
    if (path === '/locataire/messages' && home !== '/locataire' && home !== '/') return { action: 'redirect', path: `${home}/messages`, keepQuery: true }
    return { action: 'ok' }
  }
  if (SPACE_ROLES[space].includes(activeRole)) return { action: 'ok' }
  const other = roles.find(r => SPACE_ROLES[space].includes(r))
  if (other) return { action: 'switch', role: other }
  if (home === '/') return { action: 'ok' }
  if (path === `/${space}/messages`) return { action: 'redirect', path: `${home}/messages`, keepQuery: true }
  return { action: 'redirect', path: home, keepQuery: false }
}
