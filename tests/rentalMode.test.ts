import { describe, expect, it } from 'vitest'
import { classifyRental, displayPrice, filterByRental, mapLimited } from '~/utils/rentalMode'
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

describe('displayPrice', () => {
  it('préfère le loyer mensuel, avec son unité', () => {
    expect(displayPrice({ nightly: 8000, monthly: 75000 }, 35000)).toEqual({ price: 75000, suffix: '/ mois' })
  })
  it('une unité seulement à la nuit affiche son prix à la nuit, jamais son prix de base', () => {
    expect(displayPrice({ nightly: 12000, monthly: null }, 12000000)).toEqual({ price: 12000, suffix: '/ nuit' })
  })
  it('sans classement connu, garde le prix de base sans unité', () => {
    expect(displayPrice(undefined, 45000)).toEqual({ price: 45000, suffix: undefined })
  })
})

describe('filterByRental', () => {
  const cards = [
    { unitId: 'a', price: 12000000 },
    { unitId: 'b', price: 45000 },
    { unitId: 'c', price: 35000 },
    { unitId: 'd', price: 20000 }
  ]
  const modes = {
    a: { nightly: 12000, monthly: null },
    b: { nightly: null, monthly: 45000 },
    c: { nightly: 8000, monthly: 75000 }
    // 'd' : grille non chargée — exclue des deux modes plutôt que rangée au hasard
  }

  it('ne garde que les unités du mode demandé, au prix de ce mode', () => {
    expect(filterByRental(cards, modes, 'nuit', null, 'newest')).toEqual([{ unitId: 'a', price: 12000 }, { unitId: 'c', price: 8000 }])
    expect(filterByRental(cards, modes, 'mois', null, 'newest')).toEqual([{ unitId: 'b', price: 45000 }, { unitId: 'c', price: 75000 }])
  })

  it('applique le budget au prix du mode, pas au prix de base', () => {
    expect(filterByRental(cards, modes, 'nuit', 10000, 'newest')).toEqual([{ unitId: 'c', price: 8000 }])
  })

  it('retrie par prix du mode', () => {
    expect(filterByRental(cards, modes, 'mois', null, 'price_desc').map(c => c.unitId)).toEqual(['c', 'b'])
    expect(filterByRental(cards, modes, 'nuit', null, 'price_asc').map(c => c.unitId)).toEqual(['c', 'a'])
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
