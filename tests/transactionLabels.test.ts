import { describe, expect, it } from 'vitest'
import { transactionTypeLabel } from '../app/utils/transactionLabels'

describe('transactionTypeLabel', () => {
  it('couvre les cinq types déclarés dans le schéma Swagger', () => {
    expect(transactionTypeLabel('rent')).toBe('Loyer')
    expect(transactionTypeLabel('saving')).toBe('Épargne / recharge')
    expect(transactionTypeLabel('commission')).toBe('Commission')
    expect(transactionTypeLabel('withdrawal')).toBe('Retrait')
    expect(transactionTypeLabel('service_fee')).toBe('Frais de service')
  })

  it('couvre les trois types réels absents du schéma (IL4 point 4)', () => {
    expect(transactionTypeLabel('lease_entry_payment')).not.toContain('_')
    expect(transactionTypeLabel('short_stay_booking_payment')).not.toContain('_')
    expect(transactionTypeLabel('artisan_intervention_payment')).not.toContain('_')
  })

  it('ne retombe jamais sur le snake_case brut pour un type totalement inconnu', () => {
    const label = transactionTypeLabel('some_future_type')
    expect(label).not.toContain('_')
    expect(label).toBe('Some future type')
  })
})
