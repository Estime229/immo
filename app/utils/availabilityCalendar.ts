import type { AvailabilityBlock } from '~/types/property'

/**
 * `GET /units/:id/availability` renvoie des plages bloquées, pas un calendrier
 * jour par jour — même convention que les réservations (IL5) : `start_date`
 * incluse, `end_date` exclue (le jour du départ redevient disponible).
 */
export function isDateBlocked(date: Date, blocks: AvailabilityBlock[]): boolean {
  const t = date.getTime()
  return blocks.some(b => t >= new Date(b.start_date).getTime() && t < new Date(b.end_date).getTime())
}

export interface CalendarDay {
  date: Date
  iso: string
  blocked: boolean
}

/** Construit `count` jours consécutifs à partir de `start`, chacun marqué bloqué ou non. */
export function buildCalendarDays(start: Date, count: number, blocks: AvailabilityBlock[]): CalendarDay[] {
  const days: CalendarDay[] = []
  for (let i = 0; i < count; i++) {
    const d = new Date(start)
    d.setDate(d.getDate() + i)
    days.push({ date: d, iso: d.toISOString().slice(0, 10), blocked: isDateBlocked(d, blocks) })
  }
  return days
}
