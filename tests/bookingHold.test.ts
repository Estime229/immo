import { describe, expect, it } from 'vitest'
import { deriveHoldCountdown } from '~/utils/bookingHold'

describe('deriveHoldCountdown', () => {
  const now = new Date('2026-09-19T13:00:00.000Z')

  it('retourne null sans expires_at (réservation pas en hold)', () => {
    expect(deriveHoldCountdown(null, now)).toBeNull()
  })

  it('arrondit au nombre de minutes restantes supérieur', () => {
    const expiresAt = new Date(now.getTime() + 90_000).toISOString() // 1min30
    expect(deriveHoldCountdown(expiresAt, now)).toEqual({ expired: false, minutesRemaining: 2 })
  })

  it('signale expired dès que le délai est dépassé, jamais de minutes négatives', () => {
    const expiresAt = new Date(now.getTime() - 5_000).toISOString()
    expect(deriveHoldCountdown(expiresAt, now)).toEqual({ expired: true, minutesRemaining: 0 })
  })

  it('traite l\'instant exact d\'expiration comme expiré (borne <= 0)', () => {
    expect(deriveHoldCountdown(now.toISOString(), now)).toEqual({ expired: true, minutesRemaining: 0 })
  })
})
