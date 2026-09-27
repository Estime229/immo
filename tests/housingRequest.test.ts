import { describe, expect, it } from 'vitest'
import { budgetFit, daysAgoLabel, notificationTarget, requestBudgetLabel, validateRequestForm } from '../app/utils/housingRequest'

const base = { description: 'Studio meublé à Cotonou', budgetMin: '', budgetMax: '', moveInDate: '', minBedrooms: '' }

describe('validateRequestForm — contrôles absents de l\'API (constaté en live)', () => {
  it('exige une description, 2000 caractères max', () => {
    expect(validateRequestForm({ ...base, description: '  ' }, '2026-09-27')).toMatch(/Décrivez/)
    expect(validateRequestForm({ ...base, description: 'a'.repeat(2001) }, '2026-09-27')).toMatch(/2000/)
  })
  it('refuse un budget minimum supérieur au maximum (l\'API l\'acceptait)', () => {
    expect(validateRequestForm({ ...base, budgetMin: '90000', budgetMax: '50000' }, '2026-09-27')).toMatch(/dépasse/)
    expect(validateRequestForm({ ...base, budgetMin: '50 000', budgetMax: '90000' }, '2026-09-27')).toBeNull()
  })
  it('refuse une date d\'emménagement passée (l\'API l\'acceptait)', () => {
    expect(validateRequestForm({ ...base, moveInDate: '2025-01-01' }, '2026-09-27')).toMatch(/passée/)
    expect(validateRequestForm({ ...base, moveInDate: '2026-09-27' }, '2026-09-27')).toBeNull()
  })
  it('refuse les nombres non entiers', () => {
    expect(validateRequestForm({ ...base, minBedrooms: '1.5' }, '2026-09-27')).toMatch(/entier/)
  })
})

describe('requestBudgetLabel', () => {
  it('formate les trois cas', () => {
    expect(requestBudgetLabel({ budget_min: '40000', budget_max: '50000' })).toBe('40 000 F – 50 000 F')
    expect(requestBudgetLabel({ budget_min: null, budget_max: '50000' })).toBe("jusqu'à 50 000 F")
    expect(requestBudgetLabel({ budget_min: '40000', budget_max: null })).toBe('à partir de 40 000 F')
    expect(requestBudgetLabel({ budget_min: null, budget_max: null })).toBeNull()
  })
})

describe('budgetFit', () => {
  it('situe un logement par rapport au budget', () => {
    expect(budgetFit(45000, { budget_min: '40000', budget_max: '50000' })).toBe('in')
    expect(budgetFit(70000, { budget_min: '40000', budget_max: '50000' })).toBe('above')
    expect(budgetFit(30000, { budget_min: '40000', budget_max: '50000' })).toBe('below')
    expect(budgetFit(30000, { budget_min: null, budget_max: null })).toBeNull()
  })
  it('ne compare pas un budget à la nuit avec un loyer mensuel', () => {
    expect(budgetFit(70000, { budget_min: '90000', budget_max: '120000', desired_billing_frequency: 'daily' })).toBeNull()
    expect(budgetFit(70000, { budget_min: '90000', budget_max: '120000', desired_billing_frequency: 'monthly' })).toBe('below')
  })
})

describe('notificationTarget', () => {
  it('ouvre la demande concernée (métadonnées vérifiées en live)', () => {
    expect(notificationTarget({ metadata: { housing_request_id: 'hr-1', response_id: 'r-1' } })).toBe('/locataire/demandes?request=hr-1')
    expect(notificationTarget({ metadata: null })).toBeNull()
    expect(notificationTarget({})).toBeNull()
  })
  it('réservation : vers la page réservations de l\'espace courant', () => {
    expect(notificationTarget({ metadata: { bookingId: 'b-1', amount: '30000.00' } }, 'pro')).toBe('/pro/reservations?booking=b-1')
    expect(notificationTarget({ metadata: { bookingId: 'b-1' } })).toBe('/locataire/reservations?booking=b-1')
  })
  it('bail et état des lieux (métadonnées live : leaseId, inventoryId)', () => {
    expect(notificationTarget({ metadata: { leaseId: 'l-1', amount: 10000 } }, 'pro')).toBe('/pro/baux/l-1')
    expect(notificationTarget({ metadata: { leaseId: 'l-1' } })).toBe('/locataire/bail?lease=l-1')
    expect(notificationTarget({ metadata: { inventoryId: 'i-1' } }, 'pro')).toBe('/pro/edl?inventory=i-1')
    expect(notificationTarget({ metadata: { inventoryId: 'i-1' } })).toBe('/locataire/edl?inventory=i-1')
  })
  it('visite : vers la page visites de l\'espace courant', () => {
    expect(notificationTarget({ metadata: { visitId: 'v-1' } }, 'pro')).toBe('/pro/visites?visit=v-1')
    expect(notificationTarget({ metadata: { visitId: 'v-1' } })).toBe('/locataire/visites?visit=v-1')
  })
})

describe('daysAgoLabel', () => {
  const now = new Date('2026-09-27T12:00:00Z')
  it('libellés relatifs', () => {
    expect(daysAgoLabel('2026-09-27T08:00:00Z', now)).toBe("aujourd'hui")
    expect(daysAgoLabel('2026-09-26T08:00:00Z', now)).toBe('hier')
    expect(daysAgoLabel('2026-09-20T08:00:00Z', now)).toBe('il y a 7 jours')
    expect(daysAgoLabel('2026-07-20T08:00:00Z', now)).toBe('il y a 2 mois')
  })
})
