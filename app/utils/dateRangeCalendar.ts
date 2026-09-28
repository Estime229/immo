import type { AvailabilityBlock } from '../types/property'
import { isDayBlocked } from './stayPricing'

/**
 * Sélecteur de dates de séjour (fiche d'un logement). Avant : 60 cases
 * alignées à partir d'aujourd'hui, sans mois ni jours de la semaine — le 1er
 * du mois ne tombait pas sous le bon jour et rien ne disait de quel mois il
 * s'agissait. Tout est calculé sur des dates ISO (AAAA-MM-JJ), jamais sur
 * l'heure locale : `toISOString()` sur un `new Date()` décalait d'un jour
 * autour de minuit au Bénin (UTC+1).
 *
 * Convention de l'API (IL5) : une nuit est « prise » si son jour est dans une
 * plage bloquée (`start_date` incluse, `end_date` exclue). On peut donc partir
 * le jour où une plage commence (jour « départ seulement »).
 */
type Blocks = Pick<AvailabilityBlock, 'start_date' | 'end_date'>[]

const DAY = 86400000

function toMs(iso: string) {
  return Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)))
}
function fromMs(ms: number) {
  return new Date(ms).toISOString().slice(0, 10)
}
export function addDaysIso(iso: string, days: number) {
  return fromMs(toMs(iso) + days * DAY)
}
export function nightsBetween(checkIn: string, checkOut: string) {
  return Math.round((toMs(checkOut) - toMs(checkIn)) / DAY)
}

/** Date du jour à l'heure locale de l'appareil, en ISO. */
export function localTodayIso(now: Date = new Date()) {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`
}

export interface MonthRef { year: number; month: number }

export function monthOf(iso: string): MonthRef {
  return { year: Number(iso.slice(0, 4)), month: Number(iso.slice(5, 7)) - 1 }
}
export function shiftMonth(m: MonthRef, delta: number): MonthRef {
  const idx = m.year * 12 + m.month + delta
  return { year: Math.floor(idx / 12), month: ((idx % 12) + 12) % 12 }
}
export function monthIndex(m: MonthRef) {
  return m.year * 12 + m.month
}

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
const MONTHS_SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']
const WEEKDAYS_LONG = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']
export const WEEKDAY_INITIALS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

/** « Octobre 2026 » */
export function monthTitle(m: MonthRef) {
  const name = MONTHS[m.month]!
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${m.year}`
}

/** Semaines du mois, lundi en premier ; `null` pour les cases hors du mois. */
export function monthGrid(m: MonthRef): (string | null)[][] {
  const first = Date.UTC(m.year, m.month, 1)
  const daysInMonth = new Date(Date.UTC(m.year, m.month + 1, 0)).getUTCDate()
  const lead = (new Date(first).getUTCDay() + 6) % 7
  const cells: (string | null)[] = Array.from({ length: lead }, () => null)
  for (let d = 0; d < daysInMonth; d++) cells.push(fromMs(first + d * DAY))
  while (cells.length % 7) cells.push(null)
  const weeks: (string | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

/** « 16 oct. 2026 » */
export function formatDayShort(iso: string) {
  return `${Number(iso.slice(8, 10))} ${MONTHS_SHORT[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`
}
/** « 16/10/2026 » */
export function formatDayNumeric(iso: string) {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
}
/** « vendredi 16 octobre 2026 » — pour les lecteurs d'écran. */
export function formatDayLong(iso: string) {
  const weekday = WEEKDAYS_LONG[(new Date(toMs(iso)).getUTCDay() + 6) % 7]
  return `${weekday} ${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`
}

export interface RangeRules {
  today: string
  blocks: Blocks
  minNights?: number | null
  maxNights?: number | null
}

/** Arrivée possible : jour non passé dont la nuit est libre. */
export function canArrive(iso: string, r: RangeRules) {
  return iso >= r.today && !isDayBlocked(iso, r.blocks)
}

/** Premier jour pris après l'arrivée (jusqu'à un an) : c'est le dernier départ possible. */
export function firstBlockedAfter(checkIn: string, blocks: Blocks, horizonDays = 366): string | null {
  for (let i = 1; i <= horizonDays; i++) {
    const iso = addDaysIso(checkIn, i)
    if (isDayBlocked(iso, blocks)) return iso
  }
  return null
}

/** Départ possible depuis `checkIn` : après l'arrivée, sans nuit prise entre les deux, dans les limites de durée. */
export function canDepart(iso: string, checkIn: string, r: RangeRules) {
  if (iso <= checkIn) return false
  const nights = nightsBetween(checkIn, iso)
  if (r.minNights && nights < r.minNights) return false
  if (r.maxNights && nights > r.maxNights) return false
  const limit = firstBlockedAfter(checkIn, r.blocks)
  return !limit || iso <= limit
}

export interface DayState {
  disabled: boolean
  /** Barré : passé, ou nuit déjà prise (sauf s'il reste possible comme départ). */
  struck: boolean
  start: boolean
  end: boolean
  inRange: boolean
  /** Choisissable seulement comme jour de départ. */
  departureOnly: boolean
}

export function dayState(iso: string, sel: { checkIn: string | null; checkOut: string | null; hover?: string | null }, r: RangeRules): DayState {
  const past = iso < r.today
  const blocked = isDayBlocked(iso, r.blocks)
  const pickingEnd = !!sel.checkIn && !sel.checkOut
  const departOk = pickingEnd && canDepart(iso, sel.checkIn!, r)
  const arriveOk = !past && !blocked
  const end = sel.checkOut ?? (pickingEnd && sel.hover && canDepart(sel.hover, sel.checkIn!, r) ? sel.hover : null)
  return {
    disabled: pickingEnd ? !(departOk || (iso < sel.checkIn! && arriveOk) || iso === sel.checkIn) : !arriveOk,
    struck: past || (blocked && !departOk),
    start: iso === sel.checkIn,
    end: !!end && iso === end,
    inRange: !!sel.checkIn && !!end && iso > sel.checkIn && iso < end,
    departureOnly: departOk && blocked
  }
}

/**
 * Effet d'un clic : 1er clic = arrivée ; 2e clic = départ s'il est valable,
 * sinon (jour antérieur, ou au-delà d'une période prise) nouvelle arrivée.
 * Un clic sur l'arrivée elle-même annule la sélection en cours.
 */
export function pickDay(iso: string, sel: { checkIn: string | null; checkOut: string | null }, r: RangeRules): { checkIn: string | null; checkOut: string | null } {
  if (sel.checkIn && !sel.checkOut) {
    if (iso === sel.checkIn) return { checkIn: null, checkOut: null }
    if (canDepart(iso, sel.checkIn, r)) return { checkIn: sel.checkIn, checkOut: iso }
  }
  if (canArrive(iso, r)) return { checkIn: iso, checkOut: null }
  return sel
}

/** Titre et sous-titre du calendrier, comme sur les sites de réservation. */
export function rangeSummary(sel: { checkIn: string | null; checkOut: string | null }, minNights?: number | null): { title: string; subtitle: string } {
  if (sel.checkIn && sel.checkOut) {
    const n = nightsBetween(sel.checkIn, sel.checkOut)
    return { title: `${n} nuit${n > 1 ? 's' : ''}`, subtitle: `${formatDayShort(sel.checkIn)} - ${formatDayShort(sel.checkOut)}` }
  }
  const min = minNights && minNights > 1 ? `Séjour minimum : ${minNights} nuits` : 'Ajoutez vos dates pour voir le prix exact'
  if (sel.checkIn) return { title: 'Date de départ', subtitle: min }
  return { title: "Date d'arrivée", subtitle: min }
}
