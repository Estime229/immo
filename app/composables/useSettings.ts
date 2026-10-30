export type ConfigType = 'number' | 'boolean' | 'string'

export interface ConfigItem {
  key: string
  value: string
  type: ConfigType
  description: string
  is_public: boolean
  created_at: string
  updated_at: string
}

export type SettingGroupKey = 'plateforme' | 'comptes' | 'argent' | 'notifications' | 'autres'

export const SETTING_GROUPS: Array<{ key: SettingGroupKey; title: string; hint: string }> = [
  { key: 'plateforme', title: 'Accès à la plateforme', hint: "Ouverture d'Immo aux utilisateurs et limites d'usage." },
  { key: 'comptes', title: 'Comptes et vérifications', hint: "Vérification d'identité, comptes inactifs et effacement des comptes supprimés." },
  { key: 'argent', title: 'Loyers, taxes et frais', hint: 'Délais et montants appliqués à la facturation.' },
  { key: 'notifications', title: 'Notifications', hint: 'Canaux par lesquels Immo prévient les utilisateurs.' },
  { key: 'autres', title: 'Autres réglages', hint: "Réglages que cette page ne sait pas encore classer : la description vient de l'API." }
]

export interface SettingMeta {
  group: SettingGroupKey
  label: string
  help?: string
  /** Unité affichée après le champ (« jours », « % », « FCFA »). */
  unit?: string
  integer?: boolean
  min?: number
  max?: number
  /** Valeur qui demande une confirmation avant l'enregistrement, et la conséquence à afficher. */
  confirm?: { value: string; message: string; label: string }
}

/** Libellés et unités des réglages connus — les autres gardent la description renvoyée par l'API. */
const KNOWN_SETTINGS: Record<string, SettingMeta> = {
  maintenance_mode: {
    group: 'plateforme',
    label: 'Mode maintenance',
    help: "Tant qu'il est activé, les utilisateurs ne peuvent plus accéder à Immo.",
    confirm: { value: 'true', message: "Activer le mode maintenance ? Les utilisateurs ne pourront plus accéder à Immo jusqu'à ce qu'il soit désactivé.", label: 'Activer' }
  },
  ai_search_daily_quota: { group: 'plateforme', label: 'Recherche assistée par IA', help: 'Nombre maximum de recherches par jour et par adresse IP.', unit: 'par jour', integer: true, min: 0 },
  kyc_auto_approve_tenant: { group: 'comptes', label: 'Validation automatique du KYC des locataires', help: "Les dossiers d'identité des locataires sont validés sans examen par un admin." },
  days_before_inactive: { group: 'comptes', label: "Restriction d'un compte inactif", help: 'Un compte resté sans activité pendant ce délai est restreint.', unit: 'jours', integer: true, min: 1 },
  days_before_hard_delete: { group: 'comptes', label: 'Effacement définitif après suppression', help: "Délai entre la suppression d'un compte et l'effacement de ses données.", unit: 'jours', integer: true, min: 0 },
  tax_rate_percent: { group: 'argent', label: 'Taxe par défaut', help: 'TVA ou taxe plateforme appliquée par défaut.', unit: '%', min: 0, max: 100 },
  invoice_grace_period_days: { group: 'argent', label: 'Délai de grâce après échéance', help: 'Une facture non réglée passe en impayé une fois ce délai écoulé.', unit: 'jours', integer: true, min: 0 },
  bailiff_dossier_fee: { group: 'argent', label: "Frais d'un dossier de recouvrement", help: "Facturés à la génération d'un dossier de recouvrement.", unit: 'FCFA', integer: true, min: 0 },
  enable_email: { group: 'notifications', label: 'E-mail', help: 'Envoi des notifications par e-mail.' },
  enable_sms: { group: 'notifications', label: 'SMS', help: 'Envoi des notifications par SMS.' },
  enable_whatsapp: { group: 'notifications', label: 'WhatsApp', help: 'Envoi des notifications par WhatsApp.' }
}

/** Thème d'un réglage inconnu, déduit de sa clé. */
function guessGroup(key: string): SettingGroupKey {
  if (/(email|sms|whatsapp|push|notif)/.test(key)) return 'notifications'
  if (/(kyc|kyb|inactive|delete|account|user|profile)/.test(key)) return 'comptes'
  if (/(invoice|tax|fee|payment|wallet|price|commission|currency|rent|deposit)/.test(key)) return 'argent'
  if (/(maintenance|quota|search|limit|rate_limit)/.test(key)) return 'plateforme'
  return 'autres'
}

export function settingMeta(config: Pick<ConfigItem, 'key' | 'description'>): SettingMeta {
  return KNOWN_SETTINGS[config.key] ?? { group: guessGroup(config.key), label: config.description || config.key }
}

const KNOWN_ORDER = Object.keys(KNOWN_SETTINGS)

/** Réglages rangés par thème (ordre de SETTING_GROUPS, puis celui de KNOWN_SETTINGS) ; les thèmes vides sont omis. */
export function groupSettings(configs: ConfigItem[]) {
  const rank = (key: string) => (KNOWN_ORDER.includes(key) ? KNOWN_ORDER.indexOf(key) : KNOWN_ORDER.length)
  return SETTING_GROUPS
    .map(g => ({ ...g, items: configs.filter(c => settingMeta(c).group === g.key).sort((a, b) => rank(a.key) - rank(b.key) || a.key.localeCompare(b.key)) }))
    .filter(g => g.items.length)
}

/** Message d'erreur si la valeur saisie ne convient pas au réglage, sinon null. */
export function validateSettingValue(config: Pick<ConfigItem, 'key' | 'type' | 'description'>, raw: string): string | null {
  if (config.type === 'boolean') return raw === 'true' || raw === 'false' ? null : 'Valeur invalide.'
  if (config.type === 'string') return null
  const value = raw.trim().replace(',', '.')
  if (!value) return 'Saisissez une valeur.'
  const n = Number(value)
  if (!Number.isFinite(n)) return 'Saisissez un nombre.'
  const meta = settingMeta(config)
  if (meta.integer && !Number.isInteger(n)) return 'Saisissez un nombre entier.'
  if (meta.min !== undefined && n < meta.min) return `La valeur doit être d'au moins ${meta.min}.`
  if (meta.max !== undefined && n > meta.max) return `La valeur ne peut pas dépasser ${meta.max}.`
  return null
}

export function useSettings() {
  const { apiFetch } = useApi()

  function fetchConfigs() {
    return apiFetch<ConfigItem[]>('/settings/admin/configs')
  }

  function updateConfig(key: string, value: string) {
    return apiFetch<ConfigItem>(`/settings/admin/configs/${key}`, { method: 'PATCH', body: { value } })
  }

  return { fetchConfigs, updateConfig }
}
