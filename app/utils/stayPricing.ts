import type { AvailabilityBlock, UnitPricing } from '../types/property'

/**
 * Miroir exact de `calculateBookingPrice` (backend, `booking/helpers/
 * calculate-booking-price.helper.ts`) — vérifié en live (Lot 46) : 10 nuits à
 * 10 000/nuit avec une semaine à 50 000 coûtent 80 000, pas 100 000. L'écran
 * affichait `nuits × prix de la nuit`, donc un total faux dès 7 nuits.
 * La réservation en ligne exige un tarif journalier actif ; les autres
 * paliers ne servent que de remise automatique pour les longs séjours.
 */
export const PERIOD_NIGHTS: Record<string, number> = { daily: 1, weekly: 7, monthly: 30, quarterly: 90, semi_annual: 182, annual: 365 }

const PERIOD_LABEL: Record<string, [string, string]> = {
  weekly: ['semaine', 'semaines'],
  monthly: ['mois', 'mois'],
  quarterly: ['trimestre', 'trimestres'],
  semi_annual: ['semestre', 'semestres'],
  annual: ['an', 'ans']
}

export interface StayQuote {
  total: number
  /** Détail affichable, ex. [{ label: '1 semaine', amount: 50000 }, { label: '3 nuits × 10 000 F', amount: 30000 }]. */
  lines: { label: string; amount: number }[]
  /** Économie par rapport au seul tarif à la nuit. */
  saving: number
}

function nightsLabel(n: number, price: number) {
  return `${n} nuit${n > 1 ? 's' : ''} × ${Math.round(price).toLocaleString('fr-FR').replace(/ |\s/g, ' ')} F`
}

export function quoteStay(nights: number, pricing: Pick<UnitPricing, 'billing_frequency' | 'price' | 'is_available' | 'min_periods'>[]): StayQuote | null {
  const active = pricing.filter(p => p.is_available)
  const daily = active.find(p => p.billing_frequency === 'daily')
  if (!daily || nights <= 0) return null
  const dailyPrice = Number(daily.price)
  const base = nights * dailyPrice
  let best: StayQuote = { total: base, lines: [{ label: nightsLabel(nights, dailyPrice), amount: base }], saving: 0 }
  for (const tier of active) {
    if (tier.billing_frequency === 'daily') continue
    const period = PERIOD_NIGHTS[tier.billing_frequency]
    if (!period) continue
    if (nights < period * (tier.min_periods || 1)) continue
    const full = Math.floor(nights / period)
    const rest = nights % period
    const total = full * Number(tier.price) + rest * dailyPrice
    if (total < best.total) {
      const [one, many] = PERIOD_LABEL[tier.billing_frequency] ?? [tier.billing_frequency, tier.billing_frequency]
      const lines = [{ label: `${full} ${full > 1 ? many : one}`, amount: full * Number(tier.price) }]
      if (rest) lines.push({ label: nightsLabel(rest, dailyPrice), amount: rest * dailyPrice })
      best = { total, lines, saving: base - total }
    }
  }
  return best
}

/** Mêmes messages que l'API (`Séjour minimum : 2 nuit(s).`), mais avant l'envoi. */
export function stayLengthError(nights: number, minDays: number | null | undefined, maxDays: number | null | undefined): string | null {
  if (minDays && nights < minDays) return `Séjour minimum : ${minDays} nuit${minDays > 1 ? 's' : ''}.`
  if (maxDays && nights > maxDays) return `Séjour maximum : ${maxDays} nuit${maxDays > 1 ? 's' : ''}.`
  return null
}

function dayMs(iso: string) {
  return Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)))
}

/**
 * Convention API : `start_date` incluse, `end_date` exclue, `end_date: null`
 * = sans fin (bail en cours). Comparaison sur la date seule, jamais l'heure.
 */
export function isDayBlocked(iso: string, blocks: Pick<AvailabilityBlock, 'start_date' | 'end_date'>[]): boolean {
  const t = dayMs(iso)
  return blocks.some(b => t >= dayMs(b.start_date.slice(0, 10)) && (!b.end_date || t < dayMs(b.end_date.slice(0, 10))))
}

/** Une nuit bloquée entre l'arrivée (incluse) et le départ (exclu) ? L'API répond 409 sinon. */
export function rangeHitsBlock(checkIn: string, checkOut: string, blocks: Pick<AvailabilityBlock, 'start_date' | 'end_date'>[]): boolean {
  for (let t = dayMs(checkIn); t < dayMs(checkOut); t += 86400000) {
    if (isDayBlocked(new Date(t).toISOString().slice(0, 10), blocks)) return true
  }
  return false
}

/** Le formulaire demande le dernier jour bloqué (inclus) ; l'API attend le lendemain (exclu). */
export function addDays(iso: string, days: number): string {
  return new Date(dayMs(iso) + days * 86400000).toISOString().slice(0, 10)
}

/** Prix en FCFA : entier strictement positif (l'API accepte 0 et les décimales, constaté en live). */
export function validatePrice(value: string): string | null {
  const v = value.replace(/\s/g, '')
  if (!v) return 'Saisissez un prix.'
  if (!/^\d+$/.test(v) || Number(v) <= 0) return 'Le prix doit être un nombre entier de FCFA, supérieur à 0.'
  return null
}

/**
 * Prix de base de l'unité à garder aligné sur la grille : c'est lui que la
 * recherche filtre (`min_price`/`max_price`), que les fiches affichent et que
 * le bail pré-remplit. Loyer mensuel s'il existe, sinon prix de la nuit pour
 * une unité qui ne se loue qu'à la nuit ; `null` = rien à changer.
 */
export function syncedBasePrice(pricing: Pick<UnitPricing, 'billing_frequency' | 'price' | 'is_available'>[], currentBase: number): number | null {
  const active = pricing.filter(p => p.is_available)
  const monthly = active.find(p => p.billing_frequency === 'monthly')
  const daily = active.find(p => p.billing_frequency === 'daily')
  const otherLong = active.some(p => !['daily', 'weekly', 'monthly'].includes(p.billing_frequency))
  let target: number | null = null
  if (monthly) target = Number(monthly.price)
  else if (daily && !otherLong) target = Number(daily.price)
  return target !== null && target !== currentBase ? target : null
}
