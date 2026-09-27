import { describe, expect, it } from 'vitest'
import { bookingPhase, canExtend, hostAmounts, minExtensionCheckOut } from '../app/utils/bookings'

const now = new Date('2026-09-27T10:00:00')
const b = (status: 'pending_payment' | 'confirmed' | 'cancelled', check_in: string, check_out: string, expires_at: string | null = null) => ({ status, check_in, check_out, expires_at })

describe('bookingPhase — ce que l\'API ne distingue pas', () => {
  it('hold payable / hold dépassé', () => {
    expect(bookingPhase(b('pending_payment', '2026-10-01', '2026-10-04', '2026-09-27T10:10:00'), now)).toBe('hold')
    expect(bookingPhase(b('pending_payment', '2026-10-01', '2026-10-04', '2026-09-27T09:50:00'), now)).toBe('hold_expired')
  })
  it('confirmée : à venir, en cours, terminée (l\'API dit « confirmée » pour les trois)', () => {
    expect(bookingPhase(b('confirmed', '2026-10-01', '2026-10-04'), now)).toBe('upcoming')
    expect(bookingPhase(b('confirmed', '2026-09-26', '2026-09-29'), now)).toBe('ongoing')
    expect(bookingPhase(b('confirmed', '2026-09-27', '2026-09-28'), now)).toBe('ongoing')
    expect(bookingPhase(b('confirmed', '2026-09-20', '2026-09-27'), now)).toBe('past')
  })
  it('annulée', () => {
    expect(bookingPhase(b('cancelled', '2026-10-01', '2026-10-04'), now)).toBe('cancelled')
  })
})

describe('canExtend', () => {
  it('seulement un séjour confirmé non terminé (le bouton apparaissait sur des séjours finis)', () => {
    expect(canExtend(b('confirmed', '2026-10-01', '2026-10-04'), now)).toBe(true)
    expect(canExtend(b('confirmed', '2026-09-20', '2026-09-24'), now)).toBe(false)
    expect(canExtend(b('pending_payment', '2026-10-01', '2026-10-04', '2026-09-27T10:10:00'), now)).toBe(false)
  })
})

describe('minExtensionCheckOut — séjour minimum appliqué au segment ajouté (constaté en live)', () => {
  it('au moins 1 nuit, ou le minimum du logement', () => {
    expect(minExtensionCheckOut('2026-10-04', null)).toBe('2026-10-05')
    expect(minExtensionCheckOut('2026-10-04', 2)).toBe('2026-10-06')
    expect(minExtensionCheckOut('2026-10-31', 3)).toBe('2026-11-03')
  })
})

describe('hostAmounts — chiffres du paiement réel du Lot 49', () => {
  it('réduction 10 %, retenue 20 % : 21 600 perçus, 5 400 retenus', () => {
    const a = hostAmounts({ total_price: '30000.00', discount_amount: '3000.00', reward_amount: null, retained_amount: '5400.00', retention_released_at: null })
    expect(a).toEqual({ paid: 27000, net: 27000, retained: 5400, received: 21600, released: false })
  })
  it('retenue libérée : tout est perçu', () => {
    expect(hostAmounts({ total_price: '30000.00', retained_amount: '5400.00', retention_released_at: '2026-10-05' }).received).toBe(30000)
  })
})
