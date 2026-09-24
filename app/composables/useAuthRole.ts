export type UserRole = 'locataire' | 'bailleur' | 'artisan'

/** Rôle choisi à l'inscription — lu par l'écran de vérification d'identité. */
export function useAuthRole() {
  return useState<UserRole>('authRole', () => 'locataire')
}
