import { describe, expect, it } from 'vitest'
import { canComplete, validateVisitSlot, visitBucket, visitDate, visitExpired, visitMoved, visitTimeSlots } from '../app/utils/visits'

const now = new Date('2026-09-27T10:00:00')
const v = (status: string, requested: string, confirmed: string | null = null) => ({ status: status as never, requested_at: requested, confirmed_at: confirmed })

describe('visitDate / visitMoved — l\'horaire du propriétaire fait foi', () => {
  it('replanifiée : on affiche la nouvelle date, pas celle demandée (bug des deux espaces)', () => {
    const x = v('confirmed', '2026-09-29T09:00:00.000Z', '2026-10-04T16:00:00.000Z')
    expect(visitDate(x)).toBe('2026-10-04T16:00:00.000Z')
    expect(visitMoved(x)).toBe(true)
  })
  it('confirmée au même horaire : pas de changement signalé', () => {
    expect(visitMoved(v('confirmed', '2026-09-29T09:00:00.000Z', '2026-09-29T09:00:00.000Z'))).toBe(false)
    expect(visitMoved(v('pending', '2026-09-29T09:00:00.000Z'))).toBe(false)
  })
})

describe('visitBucket', () => {
  it('range selon statut ET date', () => {
    expect(visitBucket(v('pending', '2026-09-30T09:00:00'), now)).toBe('todo')
    expect(visitBucket(v('confirmed', '2026-09-30T09:00:00'), now)).toBe('upcoming')
    expect(visitBucket(v('confirmed', '2026-09-20T09:00:00'), now)).toBe('to_close')
    expect(visitBucket(v('pending', '2026-09-20T09:00:00'), now)).toBe('history')
    expect(visitBucket(v('rejected', '2026-09-30T09:00:00'), now)).toBe('history')
  })
  it('utilise la date replanifiée', () => {
    expect(visitBucket(v('confirmed', '2026-09-20T09:00:00', '2026-10-02T09:00:00'), now)).toBe('upcoming')
  })
  it('visitExpired : en attente et dépassée', () => {
    expect(visitExpired(v('pending', '2026-09-20T09:00:00'), now)).toBe(true)
    expect(visitExpired(v('pending', '2026-09-30T09:00:00'), now)).toBe(false)
  })
})

describe('canComplete — pas avant la visite (l\'API l\'accepte 8 jours avant)', () => {
  it('seulement confirmée et passée', () => {
    expect(canComplete(v('confirmed', '2026-09-30T09:00:00'), now)).toBe(false)
    expect(canComplete(v('confirmed', '2026-09-26T09:00:00'), now)).toBe(true)
    expect(canComplete(v('pending', '2026-09-26T09:00:00'), now)).toBe(false)
  })
})

describe('validateVisitSlot', () => {
  it('exige date et heure', () => {
    expect(validateVisitSlot('', '10:00', now)).toMatch(/Choisissez/)
  })
  it('7 h – 20 h seulement (l\'API accepte 3 h du matin)', () => {
    expect(validateVisitSlot('2026-09-30', '03:00', now)).toMatch(/entre 7 h et 20 h/)
    expect(validateVisitSlot('2026-09-30', '20:30', now)).toMatch(/entre 7 h et 20 h/)
    expect(validateVisitSlot('2026-09-30', '20:00', now)).toBeNull()
  })
  it('au moins 2 h à l\'avance, jamais dans le passé', () => {
    expect(validateVisitSlot('2026-09-27', '11:00', now)).toMatch(/2 heures/)
    expect(validateVisitSlot('2025-01-01', '10:00', now)).toMatch(/2 heures/)
    expect(validateVisitSlot('2026-09-27', '13:00', now)).toBeNull()
  })
  it('créneaux de 30 min de 7 h à 20 h', () => {
    const s = visitTimeSlots()
    expect(s[0]).toBe('07:00')
    expect(s.at(-1)).toBe('20:00')
    expect(s).toHaveLength(27)
  })
})
