/**
 * Mapping unique des erreurs API vers un format exploitable par les formulaires
 * et les bannières. Voir 10-SOCLE-INTEGRATION.md §2.
 */

export interface ApiValidationViolation {
  field: string
  rule: string
  defaultMessage?: string
}

export interface ApiValidationErrorPayload {
  statusCode: 400
  error: 'VALIDATION_ERROR'
  message: string
  violations: ApiValidationViolation[]
}

export interface ApiBusinessErrorPayload {
  statusCode: number
  message: string
  path?: string
}

export type ApiErrorPayload = ApiValidationErrorPayload | ApiBusinessErrorPayload | Record<string, unknown>

export type MappedApiErrorKind =
  | 'validation'
  | 'deposit_ack_required'
  | 'insufficient_balance'
  | 'auth'
  | 'account_suspended'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'rate_limited'
  | 'server'
  | 'network'
  | 'unknown'

export interface MappedApiError {
  kind: MappedApiErrorKind
  /** Un message par champ de formulaire, prêt à afficher sous le champ. */
  fieldErrors: Record<string, string>
  /** Message général, à afficher en bannière. Null si tout est rattaché à un champ. */
  bannerMessage: string | null
  /** Présent seulement pour kind === 'rate_limited', en secondes si connu. */
  retryAfterSeconds?: number
  /** Présent seulement pour kind === 'deposit_ack_required' : rejouer l'appel avec ce drapeau. */
  requiresDepositAcknowledgement?: boolean
}

/**
 * Table de correspondance "champ.règle" -> message français.
 * Complète au fil de l'intégration : un couple absent retombe sur un message
 * générique dérivé de la règle, jamais sur `defaultMessage` (technique).
 */
export const FIELD_RULE_MESSAGES: Record<string, string> = {
  'deposit_amount.isNumber': 'Le montant de la caution doit être un nombre.',
  'deposit_amount.max': 'Le montant de la caution dépasse le plafond autorisé.',
  'email.isEmail': 'Adresse email invalide.',
  'phone.isPhoneNumber': 'Numéro de téléphone invalide.',
  'start_date.isDate': 'Date de début invalide.',
  'end_date.isDate': 'Date de fin invalide.',
  'ifu.matches': "L'IFU doit comporter exactement 13 chiffres.",
  'agency_ifu.matches': "L'IFU doit comporter exactement 13 chiffres.",
  'rccm.matches': 'RCCM invalide. Format béninois, par ex. RB/COT/25 A 1234.',
  'agency_rccm.matches': 'RCCM invalide. Format béninois, par ex. RB/COT/25 A 1234.',
  'caution_months.max': 'La caution ne peut pas dépasser 3 mois (loi 2022-30).',
  'avance_months.max': "L'avance ne peut pas dépasser 3 mois (loi 2022-30).",
  'prepaye_months.max': 'Le prépayé ne peut pas dépasser 3 mois (loi 2022-30).',
  'first_name.isNotEmpty': 'Renseignez votre prénom.',
  'last_name.isNotEmpty': 'Renseignez votre nom.'
}

const BUSINESS_CODE_MESSAGES: Record<string, string> = {
  IFU_ALREADY_EXISTS: 'Cet IFU est déjà utilisé par un autre compte. Vérifiez le numéro ou contactez le support.',
  'error.KYC_REQUIRED': "Votre identité doit être vérifiée par Immo avant de publier un bien. Déposez vos pièces depuis « Vérifier mon compte » : la validation prend généralement moins de 24 h.",
  RCCM_ALREADY_EXISTS: 'Ce RCCM est déjà utilisé par un autre compte. Vérifiez le numéro ou contactez le support.',
  CPI_ALREADY_EXISTS: 'Cette carte professionnelle (CPI) est déjà utilisée par un autre compte.'
}

/**
 * Texte à afficher quand l'écran n'a pas de message sous chaque champ : la
 * bannière, sinon les messages de champ — jamais un « échoué » générique qui
 * cache une erreur de format pourtant précise (Lot 44 : « RCCM invalide »
 * s'affichait « L'enregistrement a échoué. »).
 */
export function errorText(mapped: MappedApiError, fallback: string): string {
  if (mapped.bannerMessage) return mapped.bannerMessage
  const fields = Object.values(mapped.fieldErrors)
  return fields.length ? fields.join(' ') : fallback
}

const GENERIC_RULE_MESSAGES: Record<string, string> = {
  isNumber: 'Cette valeur doit être un nombre.',
  isString: 'Cette valeur doit être du texte.',
  isEmail: 'Adresse email invalide.',
  isNotEmpty: 'Ce champ est requis.',
  min: 'Cette valeur est trop basse.',
  max: 'Cette valeur est trop élevée.',
  isDate: 'Cette date est invalide.',
  matches: 'Le format de cette valeur est invalide.',
  isEnum: 'Cette valeur n\'est pas autorisée.'
}

function fieldMessage(v: ApiValidationViolation): string {
  return (
    FIELD_RULE_MESSAGES[`${v.field}.${v.rule}`] ??
    GENERIC_RULE_MESSAGES[v.rule] ??
    'Cette valeur est invalide.'
  )
}

function isValidationPayload(payload: ApiErrorPayload): payload is ApiValidationErrorPayload {
  return (
    !!payload &&
    (payload as ApiValidationErrorPayload).error === 'VALIDATION_ERROR' &&
    Array.isArray((payload as ApiValidationErrorPayload).violations)
  )
}

const DEPOSIT_ACK_MARKER = 'depositAcknowledged: true'
const DEPOSIT_ACK_BANNER =
  "Ce montant dépasse le plafond de caution fixé par la Loi 2022-30 (3 mois de loyer). " +
  "Vous pouvez continuer si les deux parties acceptent explicitement ce dépassement."

const TIRELIRE_MARKER = 'tirelire'

export interface MapApiErrorOptions {
  /** true si l'appel a eu lieu dans un contexte d'équipe (bascule via switch-context). */
  isTeamContext?: boolean
}

/**
 * Construit une erreur exploitable à partir d'une réponse HTTP.
 * `status` peut être absent pour une panne réseau pure (pas de réponse du tout).
 */
export function mapApiError(
  payload: ApiErrorPayload | null | undefined,
  status: number | null,
  options: MapApiErrorOptions = {}
): MappedApiError {
  // Panne réseau : pas de statut du tout.
  if (status == null) {
    return {
      kind: 'network',
      fieldErrors: {},
      bannerMessage: 'Impossible de joindre le serveur. Vérifiez votre connexion et réessayez.'
    }
  }

  const message = typeof payload?.message === 'string' ? payload.message : undefined

  if (status === 400 && payload && isValidationPayload(payload)) {
    const fieldErrors: Record<string, string> = {}
    const unmatched: string[] = []
    for (const v of payload.violations) {
      if (v.field) {
        fieldErrors[v.field] = fieldMessage(v)
      } else {
        unmatched.push(fieldMessage(v))
      }
    }
    return {
      kind: 'validation',
      fieldErrors,
      bannerMessage: unmatched.length ? unmatched.join(' ') : null
    }
  }

  if (message?.includes(DEPOSIT_ACK_MARKER)) {
    return {
      kind: 'deposit_ack_required',
      fieldErrors: {},
      bannerMessage: DEPOSIT_ACK_BANNER,
      requiresDepositAcknowledgement: true
    }
  }

  if (message?.toLowerCase().includes(TIRELIRE_MARKER)) {
    return {
      kind: 'insufficient_balance',
      fieldErrors: {},
      bannerMessage: message
    }
  }

  if (status === 401) {
    return { kind: 'auth', fieldErrors: {}, bannerMessage: null }
  }

  if (status === 403) {
    // Doublons KYB renvoyés en 403 par PATCH /profile/me (vérifié en live, Lot 44) — ce n'est pas un problème de droits.
    if (message && BUSINESS_CODE_MESSAGES[message]) {
      return { kind: 'conflict', fieldErrors: {}, bannerMessage: BUSINESS_CODE_MESSAGES[message] }
    }
    return {
      kind: 'forbidden',
      fieldErrors: {},
      bannerMessage: options.isTeamContext
        ? "Vous n'avez pas les droits pour cette action dans ce contexte d'équipe."
        : "Vous n'avez pas les droits pour cette action."
    }
  }

  if (status === 404) {
    return { kind: 'not_found', fieldErrors: {}, bannerMessage: message ?? 'Ressource introuvable.' }
  }

  if (status === 409) {
    return { kind: 'conflict', fieldErrors: {}, bannerMessage: message ?? 'Conflit avec l\'état actuel.' }
  }

  if (status === 429) {
    const match = message?.match(/(\d+)\s*(s|sec|seconde)/i)
    return {
      kind: 'rate_limited',
      fieldErrors: {},
      bannerMessage: message ?? 'Trop de requêtes, réessayez plus tard.',
      retryAfterSeconds: match ? Number(match[1]) : undefined
    }
  }

  if (status >= 500) {
    return {
      kind: 'server',
      fieldErrors: {},
      bannerMessage: 'Une erreur est survenue côté serveur. Réessayez dans un instant.'
    }
  }

  return {
    kind: 'unknown',
    fieldErrors: {},
    bannerMessage: message ?? 'Une erreur inattendue est survenue.'
  }
}
