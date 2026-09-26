import type { UserRole as ApiRole } from '../types/auth'
import type { UserRole as SignupRole } from '../composables/useAuthRole'

/**
 * Inscription — vérifié en live le 26/09/2026 (Lot 44) : `verify-otp` crée
 * TOUJOURS le compte en `tenant`, sans nom. Seul `POST /onboarding/draft` puis
 * `POST /onboarding/finalize` écrivent `users.first_name/last_name` et le rôle
 * (`role`, `roles[]`, `last_active_role`). `PATCH /profile/me { full_name }`
 * n'écrit que le nom KYC chiffré, jamais celui affiché dans les espaces.
 */
export const SIGNUP_ROLE_TO_API: Record<SignupRole, ApiRole> = {
  locataire: 'tenant',
  bailleur: 'landlord',
  artisan: 'artisan'
}

/** Rôle réel de l'API → rôle d'écran (types de documents, textes, espace de destination). */
export function apiRoleToSignupRole(role: ApiRole | undefined | null): SignupRole | null {
  if (role === 'tenant') return 'locataire'
  if (role === 'landlord' || role === 'agent' || role === 'agency') return 'bailleur'
  if (role === 'artisan') return 'artisan'
  return null
}

/**
 * Un compte qui a validé son code mais jamais terminé « Créer votre compte »
 * (`is_profile_complete: false`) doit y être renvoyé à la connexion suivante —
 * sinon il atterrit dans l'espace locataire, sans nom, pour toujours.
 */
export function needsOnboarding(user: { is_profile_complete?: boolean; role?: string } | null | undefined): boolean {
  return !!user && user.is_profile_complete === false && user.role !== 'admin'
}

export interface SignupFields {
  firstName: string
  lastName: string
}

export function validateSignup(fields: SignupFields): string | null {
  if (!fields.firstName.trim()) return 'Renseignez votre prénom.'
  if (!fields.lastName.trim()) return 'Renseignez votre nom.'
  return null
}

/**
 * `/onboarding/finalize` ne vérifie PAS le format de l'IFU (bug backend
 * constaté en live : « 12345 » accepté et enregistré) — `PATCH /profile/me`
 * le vérifie. On valide donc côté client, et l'IFU/RCCM passent par
 * `PATCH /profile/me`, jamais par l'onboarding.
 */
export function validateIfu(ifu: string): string | null {
  const v = ifu.trim()
  if (!v) return null
  return /^\d{13}$/.test(v) ? null : "L'IFU doit comporter exactement 13 chiffres."
}

/** Même règle que `PATCH /profile/me` (update-profile.command.ts) — l'exemple Swagger « RB/COT/2024/B/12345 » y est lui-même refusé. */
export const RCCM_FORMAT_HINT = 'Format béninois, par ex. RB/COT/25 A 1234.'
export function validateRccm(rccm: string): string | null {
  const v = rccm.trim()
  if (!v) return null
  return /^RB\/[a-zA-Z]+\/\d{2}\s*[a-zA-Z]\s*\d+$/.test(v) ? null : `RCCM invalide. ${RCCM_FORMAT_HINT}`
}
