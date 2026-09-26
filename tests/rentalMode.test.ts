import { describe, expect, it } from 'vitest'
import { classifyRental, mapLimited } from '~/utils/rentalMode'
import type { UnitPricing } from '~/types/property'

function row(billing_frequency: string, price: string, is_available = true): UnitPricing {
  return { id: `${billing_frequency}-${price}`, unit_id: 'u1', billing_frequency, price, is_available, min_periods: 1 }
}

describe('classifyRental', () => {
  it('une unité sans grille tarifaire se loue au mois, à son prix de base', () => {
    expect(classifyRental([], 45000)).toEqual({ nightly: null, monthly: 45000 })
  })

  it('une unité avec seulement un tarif journalier actif ne se loue qu\'à la nuit', () => {
    expect(classifyRental([row('daily', '12000.00')], 12000000)).toEqual({ nightly: 12000, monthly: null })
  })

  it('un tarif journalier actif et un tarif mensuel actif donnent les deux modes', () => {
    expect(classifyRental([row('daily', '8000'), row('monthly', '75000')], 35000)).toEqual({ nightly: 8000, monthly: 75000 })
  })

  it('ignore les tarifs désactivés — un mensuel inactif ne rend pas l\'unité louable au mois', () => {
    expect(classifyRental([row('daily', '8000'), row('monthly', '75000', false)], 35000)).toEqual({ nightly: 8000, monthly: null })
  })

  it('une grille longue durée sans tarif mensuel explicite retombe sur le prix de base', () => {
    expect(classifyRental([row('annual', '900000')], 80000)).toEqual({ nightly: null, monthly: 80000 })
  })

  it('un prix de base nul n\'est jamais présenté comme un loyer', () => {
    expect(classifyRental([], 0)).toEqual({ nightly: null, monthly: null })
  })
})

describe('mapLimited', () => {
  it('conserve l\'ordre et ne dépasse jamais la limite de concurrence', async () => {
    let running = 0
    let peak = 0
    const res = await mapLimited([1, 2, 3, 4, 5, 6, 7], 3, async n => {
      running++
      peak = Math.max(peak, running)
      await new Promise(r => setTimeout(r, 5))
      running--
      return n * 10
    })
    expect(res).toEqual([10, 20, 30, 40, 50, 60, 70])
    expect(peak).toBeLessThanOrEqual(3)
  })
})
