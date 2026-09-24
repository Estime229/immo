/**
 * Types pour le profil (IL8). `GET /profile/me` masque systématiquement les
 * champs sensibles (`*_masked: "********"`) — jamais la valeur en clair,
 * contrairement à `PATCH /profile/me` qui accepte les valeurs en clair en
 * écriture. Ne jamais afficher `********` comme si c'était la vraie valeur :
 * le formulaire d'édition part vide, pas pré-rempli avec le masque.
 */
export interface ProfileMe {
  id: string
  user_id: string
  full_name_masked: string | null
  id_card_masked: string | null
  profession_masked: string | null
  company_masked: string | null
  ifu_masked: string | null
  rccm_masked: string | null
  emergency_contact_masked: string | null
  preferred_zone: string | null
  /** `null` tant qu'aucune zone n'est renseignée — vérifié en direct, pas `[]` comme le laissait supposer l'exemple Swagger. */
  preferred_zones: string[] | null
  budget_min: string | null
  budget_max: string | null
  kyc_status: string
  /** Champs propriétaire/agence — vérifiés en direct le 2026-09-20 (compte landlord de test, IP3). */
  agency_company_name: string | null
  agency_ifu_masked: string | null
  agency_rccm_masked: string | null
  public_bio: string | null
  /** `null` tant qu'aucun champ pro (`company`/`ifu`/`rccm`) n'a été renseigné, passe à `"pending"` dès la première écriture — vérifié en direct. */
  landlord_kyb_status: string | null
  agency_kyb_status: string | null
}

/**
 * `budget_min`/`budget_max` : le schéma Swagger les déclare `number`, mais
 * l'API les valide en réalité comme des chaînes (`isString`, 400 sinon) —
 * vérifié en direct le 2026-09-19. `company`/`ifu`/`rccm` : propriétaire/agent
 * uniquement (vérifié en direct pour `company`, IP3) ; `agency_*` réservés
 * aux comptes agence (non testés, rôle `agency` non disponible).
 */
export interface UpdateProfilePayload {
  full_name?: string
  profession?: string
  emergency_contact?: string
  preferred_zones?: string[]
  budget_min?: string
  budget_max?: string
  company?: string
  ifu?: string
  rccm?: string
}

export interface UpdateProfileResult {
  id: string
  kyc_status: string
  message: string
}

export type NotificationChannel = 'email' | 'sms' | 'push'

/** `whatsapp` est renvoyé par GET mais n'a pas de route PATCH dédiée (seuls email/sms/push sont togglables) — affiché en lecture seule si présent. */
export interface NotificationPreferences {
  email: boolean
  sms: boolean
  push: boolean
  whatsapp?: boolean
}
