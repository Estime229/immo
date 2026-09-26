/**
 * Types du domaine authentification, écrits à la main : le Swagger documente
 * ces réponses avec des `example`, pas des schémas typés (`properties`), donc
 * openapi-typescript génère `unknown` pour leur contenu. Voir 10-SOCLE-INTEGRATION.md
 * §0 : « tape les réponses à la main — en recopiant les noms de champs depuis
 * le code du backend, jamais de mémoire. »
 *
 * Champs et exemples vérifiés le 2026-09-17 sur le Swagger live
 * (https://immo-b89b.onrender.com/docs/v1-json). Ne pas deviner un champ
 * absent des exemples : ouvrir un ticket backend pour le faire documenter.
 */

/** Union relevée sur l'ensemble des schémas qui déclarent un rôle utilisateur. */
export type UserRole = 'tenant' | 'landlord' | 'agent' | 'agency' | 'artisan' | 'admin'

/** Confirmé sur le Swagger : exactement ces trois valeurs, rien d'autre. */
export type UserStatus = 'active' | 'restricted' | 'banned'

export interface AuthUserProfile {
  id: string
  user_id: string
  /** Pas d'énumération formelle publiée pour l'instant — traité en chaîne libre jusqu'à I3 (KYC). */
  kyc_status?: string
}

export interface AuthUser {
  id: string
  email: string
  phone_number?: string
  first_name?: string
  last_name?: string
  avatar_url?: string | null
  role: UserRole
  /** Présent sur GET /auth/me uniquement — absent des payloads de login/verify-otp/google. */
  status?: UserStatus
  admin_level?: string | null
  is_profile_complete: boolean
  is_verified: boolean
  preferred_lang?: string
  preferred_theme?: string
  has_password: boolean
  /** Présent sur GET /auth/me — une pièce d'identité a été déposée (POST /user/id-card). */
  has_id_card?: boolean
  created_at?: string
  updated_at?: string
  profile?: AuthUserProfile
  /** Présent sur GET /auth/me uniquement. */
  active_team_id?: string | null
}

/** Forme commune à login / verify-otp / google : { token, refresh_token, user, ... }. */
export interface AuthSession {
  token: string
  refresh_token: string
  user: AuthUser
  profile?: AuthUserProfile
  has_password?: boolean
  is_profile_complete?: boolean
  /** Absent sur /auth/login (suppose toujours un compte existant) ; présent sur verify-otp/google. */
  is_new_user?: boolean
  is_pending?: boolean
}

export interface CheckEmailResult {
  exists: boolean
  has_password: boolean
}

export interface RequestOtpResult {
  success: boolean
  available_channels: string[]
  sent_channels: string[]
  whatsapp_link: string | null
}

export interface SimpleSuccessResult {
  success: boolean
}

export interface SetPasswordResult {
  message: string
  /** Uniquement à la création d'un mot de passe — le filet de secours à afficher une seule fois. */
  recovery_codes?: string[]
}

export interface RolesResult {
  roles: UserRole[]
  active_role: UserRole
}

export interface SwitchRoleResult {
  token: string
  refresh_token: string
  active_role: UserRole
}

export interface SwitchContextResult {
  token: string
  /** Pas de refresh_token ici — bug backend documenté, voir 10-SOCLE-INTEGRATION.md §9. */
  active_team_id: string | null
  team_name?: string | null
}
