import { describe, expect, it } from 'vitest'
import { overdueSummary } from '../app/utils/leaseOverdue'

describe('overdueSummary — retard affiché dans la liste des baux', () => {
  it('compte les échéances en retard et additionne leurs montants (chaînes décimales de l\'API)', () => {
    expect(overdueSummary([
      { status: 'overdue', amount: '70000.00' },
      { status: 'paid', amount: '70000.00' },
      { status: 'overdue', amount: '70000' },
      { status: 'pending', amount: '70000.00' }
    ])).toEqual({ count: 2, total: 140000 })
  })

  it('ne compte que le statut `overdue` : une échéance en attente ou payée en partie n\'est pas « en retard » pour le serveur', () => {
    expect(overdueSummary([{ status: 'pending', amount: '1000' }, { status: 'partially_paid', amount: '1000' }])).toEqual({ count: 0, total: 0 })
  })

  it('tolère un bail sans échéancier', () => {
    expect(overdueSummary(undefined)).toEqual({ count: 0, total: 0 })
    expect(overdueSummary(null)).toEqual({ count: 0, total: 0 })
    expect(overdueSummary([])).toEqual({ count: 0, total: 0 })
  })

  it('compte une échéance au montant illisible sans rendre le total NaN', () => {
    expect(overdueSummary([{ status: 'overdue', amount: 'abc' }, { status: 'overdue', amount: '5000.50' }])).toEqual({ count: 2, total: 5000.5 })
  })
})
