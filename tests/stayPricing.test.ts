import { describe, expect, it } from 'vitest'
import { addDays, isDayBlocked, quoteStay, rangeHitsBlock, stayLengthError, syncedBasePrice, validatePrice } from '../app/utils/stayPricing'

const tiers = [
  { billing_frequency: 'daily', price: '10000', is_available: true, min_periods: 1 },
  { billing_frequency: 'weekly', price: '50000', is_available: true, min_periods: 1 },
  { billing_frequency: 'monthly', price: '150000', is_available: true, min_periods: 1 }
]

describe('quoteStay — mêmes totaux que l\'API (vérifiés en live, Lot 46)', () => {
  it('10 nuits = 1 semaine + 3 nuits = 80 000 (l\'écran affichait 100 000)', () => {
    const q = quoteStay(10, tiers)!
    expect(q.total).toBe(80000)
    expect(q.saving).toBe(20000)
    expect(q.lines.map(l => l.label)).toEqual(['1 semaine', '3 nuits × 10 000 F'])
  })
  it('35 nuits = 1 mois + 5 nuits = 200 000', () => {
    expect(quoteStay(35, tiers)!.total).toBe(200000)
  })
  it('séjour court : prix à la nuit seul', () => {
    expect(quoteStay(3, tiers)).toMatchObject({ total: 30000, saving: 0 })
  })
  it('respecte min_periods et ignore un palier inactif', () => {
    const t = [tiers[0]!, { ...tiers[1]!, min_periods: 2 }, { ...tiers[2]!, is_available: false }]
    expect(quoteStay(10, t)!.total).toBe(100000)
    expect(quoteStay(14, t)!.total).toBe(100000)
  })
  it('pas de tarif à la nuit actif = pas de réservation en ligne', () => {
    expect(quoteStay(10, [tiers[2]!])).toBeNull()
  })
})

describe('stayLengthError', () => {
  it('reprend les limites du logement', () => {
    expect(stayLengthError(1, 2, 40)).toBe('Séjour minimum : 2 nuits.')
    expect(stayLengthError(46, 2, 40)).toBe('Séjour maximum : 40 nuits.')
    expect(stayLengthError(5, 2, 40)).toBeNull()
    expect(stayLengthError(5, null, null)).toBeNull()
  })
})

describe('blocages (début inclus, fin exclue, fin nulle = sans fin)', () => {
  const blocks = [{ start_date: '2026-12-20', end_date: '2026-12-27' }, { start_date: '2027-03-01', end_date: null }]
  it('isDayBlocked', () => {
    expect(isDayBlocked('2026-12-20', blocks)).toBe(true)
    expect(isDayBlocked('2026-12-27', blocks)).toBe(false)
    expect(isDayBlocked('2028-01-01', blocks)).toBe(true)
  })
  it('rangeHitsBlock : une période qui enjambe un blocage est refusée (409 côté API)', () => {
    expect(rangeHitsBlock('2026-12-18', '2026-12-22', blocks)).toBe(true)
    expect(rangeHitsBlock('2026-12-27', '2026-12-30', blocks)).toBe(false)
    expect(rangeHitsBlock('2026-12-15', '2026-12-20', blocks)).toBe(false)
  })
  it('addDays convertit un dernier jour inclus en fin exclue', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })
})

describe('validatePrice — l\'API accepte 0 et 1000,5 (constaté en live)', () => {
  it('exige un entier > 0', () => {
    expect(validatePrice('0')).toMatch(/supérieur à 0/)
    expect(validatePrice('1000.5')).toMatch(/entier/)
    expect(validatePrice('')).toMatch(/Saisissez/)
    expect(validatePrice('15 000')).toBeNull()
  })
})

describe('syncedBasePrice — prix de base aligné sur la grille', () => {
  it('suit le loyer mensuel', () => {
    expect(syncedBasePrice(tiers, 85000)).toBe(150000)
    expect(syncedBasePrice(tiers, 150000)).toBeNull()
  })
  it('suit le prix de la nuit pour une unité à la nuit seulement', () => {
    expect(syncedBasePrice([tiers[0]!, tiers[1]!], 85000)).toBe(10000)
  })
  it('ne touche à rien sans grille exploitable', () => {
    expect(syncedBasePrice([], 85000)).toBeNull()
    expect(syncedBasePrice([{ billing_frequency: 'annual', price: '900000', is_available: true }], 85000)).toBeNull()
  })
})
