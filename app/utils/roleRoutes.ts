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
