import { describe, expect, it } from 'vitest'
import { deleteBlocker, imagesPayload, rentalChoiceOf, rentalSetup, validateMonths, validateRentalPrices } from '../app/utils/propertyForm'
import { classifyRental } from '../app/utils/rentalMode'
import { mapApiError } from '../app/utils/apiErrors'
import type { UnitPricing } from '../app/types/property'

function asPricing(rows: { billing_frequency: string; price: number }[]): UnitPricing[] {
  return rows.map((r, i) => ({ id: String(i), unit_id: 'u', billing_frequency: r.billing_frequency, price: String(r.price), is_available: true, min_periods: 1 }) as unknown as UnitPricing)
}

describe('rentalSetup — ce que crée l\'assistant, relu par la classification de l\'accueil/recherche', () => {
  it('au mois : prix de base = loyer, aucune grille → classé « au mois » à ce loyer', () => {
    const s = rentalSetup('mois', 85000, null)
    expect(s).toMatchObject({ price: 85000, min_duration_days: 30, pricing: [] })
    expect(classifyRental(asPricing(s.pricing), s.price)).toEqual({ nightly: null, monthly: 85000 })
  })
  it('à la nuit : tarif journalier créé → classé « à la nuit », jamais « au mois »', () => {
    const s = rentalSetup('nuit', null, 15000)
    expect(s).toMatchObject({ price: 15000, min_duration_days: 1, characteristics: { billing_type: 'daily' } })
    expect(classifyRental(asPricing(s.pricing), s.price)).toEqual({ nightly: 15000, monthly: null })
  })
  it('les deux : tarif mensuel explicite, sinon le journalier ferait perdre le « au mois »', () => {
    const s = rentalSetup('les_deux', 85000, 15000)
    expect(s.pricing.map(p => p.billing_frequency)).toEqual(['monthly', 'daily'])
    expect(classifyRental(asPricing(s.pricing), s.price)).toEqual({ nightly: 15000, monthly: 85000 })
  })
})

describe('validateRentalPrices', () => {
  it('exige le prix du ou des modes choisis', () => {
    expect(validateRentalPrices('mois', '', '')).toMatch(/loyer mensuel/)
    expect(validateRentalPrices('nuit', '85000', '')).toMatch(/par nuit/)
    expect(validateRentalPrices('les_deux', '85000', '')).toMatch(/par nuit/)
    expect(validateRentalPrices('nuit', '', '15000')).toBeNull()
  })
})

describe('rentalChoiceOf', () => {
  it('déduit le mode de la grille existante', () => {
    expect(rentalChoiceOf([{ billing_frequency: 'daily', is_available: true }])).toBe('nuit')
    expect(rentalChoiceOf([{ billing_frequency: 'daily', is_available: true }, { billing_frequency: 'monthly', is_available: true }])).toBe('les_deux')
    expect(rentalChoiceOf([])).toBe('mois')
    expect(rentalChoiceOf([], 'daily')).toBe('nuit')
    expect(rentalChoiceOf([{ billing_frequency: 'daily', is_available: false }])).toBe('mois')
  })
})

describe('validateMonths — plafond légal, sans « dérogation » que l\'API refuse', () => {
  it('refuse au-delà de 3 mois et les valeurs non entières', () => {
    expect(validateMonths('Caution', '4')).toMatch(/3 mois/)
    expect(validateMonths('Avance', '1.5')).toMatch(/entier/)
    expect(validateMonths('Caution', '3')).toBeNull()
    expect(validateMonths('Caution', '')).toBeNull()
  })
  it('le refus serveur (caution_months.max) est traduit', () => {
    const m = mapApiError({ statusCode: 400, error: 'VALIDATION_ERROR', message: 'x', violations: [{ field: 'caution_months', rule: 'max' }] }, 400)
    expect(m.fieldErrors.caution_months).toMatch(/3 mois/)
  })
})

describe('imagesPayload — seul moyen de retirer/réordonner une photo', () => {
  const media = [
    { id: 'a', url: 'https://x/a.webp', is_primary: true },
    { id: 'b', url: 'https://x/b.webp', is_primary: false },
    { id: 'c', url: 'https://x/c.webp', is_primary: false }
  ]
  it('rangs à partir de 1 (0 refusé par l\'API) et une seule principale', () => {
    const p = imagesPayload(media, {})
    expect(p.map(i => i.rank)).toEqual([1, 2, 3])
    expect(p.filter(i => i.is_primary)).toHaveLength(1)
  })
  it('retirer la principale promeut la suivante', () => {
    const p = imagesPayload(media, { removeId: 'a' })
    expect(p.map(i => i.url)).toEqual(['https://x/b.webp', 'https://x/c.webp'])
    expect(p[0]).toMatchObject({ is_primary: true, rank: 1 })
  })
  it('choisir une principale la place en premier', () => {
    const p = imagesPayload(media, { primaryId: 'c' })
    expect(p[0]).toMatchObject({ url: 'https://x/c.webp', is_primary: true, rank: 1 })
    expect(p.filter(i => i.is_primary)).toHaveLength(1)
  })
})

describe('deleteBlocker — l\'API supprime même un bien occupé (constaté en live)', () => {
  it('bloque tant qu\'un logement est occupé ou en préavis', () => {
    expect(deleteBlocker([{ unit_status: 'occupied' }])).toMatch(/bail/)
    expect(deleteBlocker([{ unit_status: 'notice_given' }, { unit_status: 'occupied' }])).toMatch(/2 unités/)
    expect(deleteBlocker([{ unit_status: 'available' }, { unit_status: 'maintenance' }])).toBeNull()
  })
})

describe('KYC_REQUIRED', () => {
  it('le 403 de création d\'un bien explique la vérification au lieu de « pas les droits »', () => {
    expect(mapApiError({ statusCode: 403, message: 'error.KYC_REQUIRED' }, 403).bannerMessage).toMatch(/identité doit être vérifiée/)
  })
})
