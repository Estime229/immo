import type { HousingRequestCriteria } from '../types/tenant'

/** Même enum que les tarifs (`LeaseBillingFrequency`). */
export const REQUEST_FREQUENCY_LABEL: Record<string, string> = {
  daily: 'À la nuit', weekly: 'À la semaine', monthly: 'Au mois', quarterly: 'Au trimestre', semi_annual: 'Au semestre', annual: "À l'année"
}

/** Choix proposés au locataire — la ville et la fréquence sont les deux seuls filtres des propriétaires. */
export const REQUEST_RENTAL_CHOICES = [
  { value: 'monthly', label: 'Au mois' },
  { value: 'daily', label: 'À la nuit' },
  { value: '', label: 'Peu importe' }
] as const

function fcfa(n: number) {
  return `${Math.round(n).toLocaleString('fr-FR').replace(/ /g, ' ')} F`
}

export function requestBudgetLabel(r: Pick<HousingRequestCriteria, 'budget_min' | 'budget_max'>): string | null {
  const min = r.budget_min ? Number(r.budget_min) : null
  const max = r.budget_max ? Number(r.budget_max) : null
  if (min && max) return `${fcfa(min)} – ${fcfa(max)}`
  if (max) return `jusqu'à ${fcfa(max)}`
  if (min) return `à partir de ${fcfa(min)}`
  return null
}

export interface RequestFormInput {
  description: string
  budgetMin: string
  budgetMax: string
  moveInDate: string
  minBedrooms: string
}

/**
 * Contrôles que l'API ne fait pas (vérifié en live, Lot 47) : un budget
 * minimum supérieur au maximum et une date d'emménagement passée étaient
 * acceptés tels quels. La longueur maximale (2000) est celle de l'API.
 */
export function validateRequestForm(f: RequestFormInput, todayIso: string): string | null {
  const d = f.description.trim()
  if (!d) return 'Décrivez ce que vous cherchez.'
  if (d.length > 2000) return 'La description ne peut pas dépasser 2000 caractères.'
  for (const [label, v] of [['Budget minimum', f.budgetMin], ['Budget maximum', f.budgetMax], ['Chambres minimum', f.minBedrooms]] as const) {
    const t = v.replace(/\s/g, '')
    if (t && !/^\d+$/.test(t)) return `${label} : saisissez un nombre entier.`
  }
  const min = Number(f.budgetMin.replace(/\s/g, '') || 0)
  const max = Number(f.budgetMax.replace(/\s/g, '') || 0)
  if (min && max && min > max) return 'Le budget minimum dépasse le budget maximum.'
  if (f.moveInDate && f.moveInDate < todayIso) return "La date d'emménagement est déjà passée."
  return null
}

/** Position d'un logement par rapport au budget d'une demande — aide le propriétaire à choisir quoi proposer. */
export function budgetFit(price: number, r: Pick<HousingRequestCriteria, 'budget_min' | 'budget_max' | 'desired_billing_frequency'>): 'in' | 'above' | 'below' | null {
  // Budget « à la nuit » contre un prix affiché qui est un loyer mensuel : comparaison sans objet.
  if (r.desired_billing_frequency && r.desired_billing_frequency !== 'monthly') return null
  const min = r.budget_min ? Number(r.budget_min) : null
  const max = r.budget_max ? Number(r.budget_max) : null
  if (min === null && max === null) return null
  if (max !== null && price > max) return 'above'
  if (min !== null && price < min) return 'below'
  return 'in'
}

/**
 * Destination d'une notification d'après ses métadonnées — seules les clés
 * vérifiées en live sont reconnues : `housing_request_id` (réponse à une
 * demande, Lot 47) et `visitId` (toutes les étapes d'une visite, Lot 48 —
 * notée en camelCase par l'API, contrairement au reste). Une visite concerne
 * les deux espaces : la destination dépend de l'espace où l'on se trouve.
 */
export function notificationTarget(n: { metadata?: Record<string, unknown> | null }, space: 'locataire' | 'pro' = 'locataire'): string | null {
  const m = n.metadata ?? {}
  if (typeof m.housing_request_id === 'string') return `/locataire/demandes?request=${m.housing_request_id}`
  if (typeof m.visitId === 'string') return `/${space}/visites?visit=${m.visitId}`
  return null
}

export function daysAgoLabel(iso: string, now: Date = new Date()): string {
  const days = Math.floor((now.getTime() - new Date(iso).getTime()) / 86400000)
  if (days <= 0) return "aujourd'hui"
  if (days === 1) return 'hier'
  if (days < 30) return `il y a ${days} jours`
  const months = Math.floor(days / 30)
  return `il y a ${months} mois`
}

/** Mémoire locale d'un propriétaire : unités déjà proposées sur une demande et conversation ouverte (l'API ne l'expose pas). */
export interface AnsweredEntry {
  unitIds: string[]
  conversationId: string | null
}
