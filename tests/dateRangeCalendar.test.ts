import { describe, expect, it } from 'vitest'
import { canDepart, dayState, firstBlockedAfter, formatDayLong, formatDayNumeric, formatDayShort, localTodayIso, monthGrid, monthTitle, nightsBetween, pickDay, rangeSummary, shiftMonth } from '../app/utils/dateRangeCalendar'

// Octobre 2026 : le 1er est un jeudi (comme sur la capture de référence).
const OCT = { year: 2026, month: 9 }
const blocks = [
  { start_date: '2026-10-09', end_date: '2026-10-12' }, // nuits des 9, 10, 11 prises
  { start_date: '2026-10-20', end_date: '2026-10-25' }
]
const rules = { today: '2026-10-04', blocks, minNights: 2, maxNights: 10 }

describe('grille du mois (lundi en premier)', () => {
  it('place le 1er octobre 2026 sous le jeudi et termine la dernière semaine', () => {
    const weeks = monthGrid(OCT)
    expect(weeks[0]).toEqual([null, null, null, '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'])
    expect(weeks.at(-1)).toEqual(['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', null])
    expect(weeks.every(w => w.length === 7)).toBe(true)
  })
  it('nomme et fait défiler les mois, y compris au changement d\'année', () => {
    expect(monthTitle(OCT)).toBe('Octobre 2026')
    expect(shiftMonth({ year: 2026, month: 11 }, 1)).toEqual({ year: 2027, month: 0 })
    expect(shiftMonth({ year: 2026, month: 0 }, -1)).toEqual({ year: 2025, month: 11 })
    expect(monthGrid({ year: 2027, month: 1 }).flat().filter(Boolean)).toHaveLength(28)
  })
})

describe('formats', () => {
  it('écrit les dates comme sur la capture', () => {
    expect(formatDayShort('2026-10-16')).toBe('16 oct. 2026')
    expect(formatDayNumeric('2026-10-16')).toBe('16/10/2026')
    expect(formatDayLong('2026-10-16')).toBe('vendredi 16 octobre 2026')
    expect(nightsBetween('2026-10-16', '2026-10-18')).toBe(2)
  })
  it('prend la date locale, pas celle d\'UTC', () => {
    expect(localTodayIso(new Date(2026, 9, 5, 0, 30))).toBe('2026-10-05')
  })
})

describe('règles de sélection', () => {
  it('barre les jours passés et les nuits prises', () => {
    expect(dayState('2026-10-02', { checkIn: null, checkOut: null }, rules)).toMatchObject({ disabled: true, struck: true })
    expect(dayState('2026-10-10', { checkIn: null, checkOut: null }, rules)).toMatchObject({ disabled: true, struck: true })
    expect(dayState('2026-10-12', { checkIn: null, checkOut: null }, rules)).toMatchObject({ disabled: false, struck: false })
  })
  it('permet de partir le jour où une période prise commence (départ seulement)', () => {
    expect(firstBlockedAfter('2026-10-05', blocks)).toBe('2026-10-09')
    expect(canDepart('2026-10-09', '2026-10-05', rules)).toBe(true)
    expect(canDepart('2026-10-10', '2026-10-05', rules)).toBe(false)
    expect(dayState('2026-10-09', { checkIn: '2026-10-05', checkOut: null }, rules)).toMatchObject({ disabled: false, struck: false, departureOnly: true })
  })
  it('respecte le séjour minimum et maximum', () => {
    expect(canDepart('2026-10-13', '2026-10-12', rules)).toBe(false)
    expect(canDepart('2026-10-14', '2026-10-12', rules)).toBe(true)
    expect(canDepart('2026-10-20', '2026-10-12', { ...rules, maxNights: 5 })).toBe(false)
  })
  it('enchaîne arrivée puis départ, et recommence sur un jour antérieur ou au-delà d\'une période prise', () => {
    let sel = pickDay('2026-10-16', { checkIn: null, checkOut: null }, rules)
    expect(sel).toEqual({ checkIn: '2026-10-16', checkOut: null })
    sel = pickDay('2026-10-18', sel, rules)
    expect(sel).toEqual({ checkIn: '2026-10-16', checkOut: '2026-10-18' })
    expect(pickDay('2026-10-26', { checkIn: '2026-10-16', checkOut: null }, rules)).toEqual({ checkIn: '2026-10-26', checkOut: null })
    expect(pickDay('2026-10-13', { checkIn: '2026-10-16', checkOut: null }, rules)).toEqual({ checkIn: '2026-10-13', checkOut: null })
    expect(pickDay('2026-10-16', { checkIn: '2026-10-16', checkOut: null }, rules)).toEqual({ checkIn: null, checkOut: null })
    expect(pickDay('2026-10-10', { checkIn: null, checkOut: null }, rules)).toEqual({ checkIn: null, checkOut: null })
  })
  it('surligne la plage choisie, et la plage survolée pendant le choix du départ', () => {
    const sel = { checkIn: '2026-10-16', checkOut: '2026-10-19' }
    expect(dayState('2026-10-17', sel, rules).inRange).toBe(true)
    expect(dayState('2026-10-16', sel, rules).start).toBe(true)
    expect(dayState('2026-10-19', sel, rules).end).toBe(true)
    expect(dayState('2026-10-18', { checkIn: '2026-10-16', checkOut: null, hover: '2026-10-19' }, rules).inRange).toBe(true)
  })
  it('résume la sélection', () => {
    expect(rangeSummary({ checkIn: '2026-10-16', checkOut: '2026-10-18' })).toEqual({ title: '2 nuits', subtitle: '16 oct. 2026 - 18 oct. 2026' })
    expect(rangeSummary({ checkIn: '2026-10-16', checkOut: null }, 2)).toEqual({ title: 'Date de départ', subtitle: 'Séjour minimum : 2 nuits' })
    expect(rangeSummary({ checkIn: null, checkOut: null })).toEqual({ title: "Date d'arrivée", subtitle: 'Ajoutez vos dates pour voir le prix exact' })
  })
})
