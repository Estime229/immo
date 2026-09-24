import { describe, expect, it } from 'vitest'
import { buildCalendarDays, isDateBlocked } from '~/utils/availabilityCalendar'

describe('isDateBlocked', () => {
  const blocks = [{ start_date: '2026-08-10', end_date: '2026-08-15', blocked_by: 'short_stay_booking' }]

  it('bloque une date strictement à l\'intérieur de la plage', () => {
    expect(isDateBlocked(new Date('2026-08-12'), blocks)).toBe(true)
  })

  it('bloque la date de début (incluse)', () => {
    expect(isDateBlocked(new Date('2026-08-10'), blocks)).toBe(true)
  })

  it('ne bloque pas la date de fin (exclue — jour de départ redisponible, même convention que les réservations)', () => {
    expect(isDateBlocked(new Date('2026-08-15'), blocks)).toBe(false)
  })

  it('ne bloque pas une date hors plage', () => {
    expect(isDateBlocked(new Date('2026-09-01'), blocks)).toBe(false)
  })

  it('ne bloque jamais rien sans plage', () => {
    expect(isDateBlocked(new Date('2026-08-12'), [])).toBe(false)
  })
})

describe('buildCalendarDays', () => {
  it('construit le bon nombre de jours consécutifs, chacun marqué bloqué ou non', () => {
    const blocks = [{ start_date: '2026-08-11', end_date: '2026-08-13', blocked_by: 'x' }]
    const days = buildCalendarDays(new Date('2026-08-10'), 5, blocks)
    expect(days.map(d => d.blocked)).toEqual([false, true, true, false, false])
    expect(days[0]!.iso).toBe('2026-08-10')
  })
})
