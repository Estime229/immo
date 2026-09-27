import { describe, expect, it } from 'vitest'
import { acceptancePreview, conflictingLease, draftLeaseFor, groupByUnit, latestRequestFor, leaseStartIfAccepted, validateCandidature, visitOf } from '../app/utils/rentalRequests'
import type { RentalRequestSummary, VisitSummary } from '../app/types/tenant'

const unit = { id: 'u1', name: 'F2', price: '50000.00', caution_months: 2, avance_months: 1, prepaye_months: 1 }
const req = (o: Partial<RentalRequestSummary>): RentalRequestSummary => ({
  id: 'r', unit_id: 'u1', tenant_id: 't1', status: 'pending', message: null, desired_move_in_at: null,
  created_at: '2026-09-27T10:00:00Z', responded_at: null, conversation_id: null, unit, ...o
})

describe('validateCandidature — contrôles absents de l\'API (live : date invalide → 500, date passée acceptée)', () => {
  it('date invalide ou passée, message trop long', () => {
    expect(validateCandidature({ moveIn: 'abc', message: '' }, '2026-09-27')).toMatch(/invalide/)
    expect(validateCandidature({ moveIn: '2026-09-17', message: '' }, '2026-09-27')).toMatch(/passée/)
    expect(validateCandidature({ moveIn: '', message: 'x'.repeat(2001) }, '2026-09-27')).toMatch(/2000/)
  })
  it('accepte sans date ni message, ou une date future', () => {
    expect(validateCandidature({ moveIn: '', message: '' }, '2026-09-27')).toBeNull()
    expect(validateCandidature({ moveIn: '2026-10-17', message: 'Bonjour' }, '2026-09-27')).toBeNull()
  })
})

describe('acceptancePreview — ce que l\'API prépare (live : 50 000, caution 100 000, avance 50 000, prépayé 0)', () => {
  it('caution et avance d\'après le logement, prépayé ignoré', () => {
    expect(acceptancePreview(unit)).toEqual({ rent: 50000, depositMonths: 2, deposit: 100000, advanceMonths: 1, advance: 50000, prepaidIgnored: true })
  })
  it('caution 2 mois par défaut, plafonnée à 3', () => {
    expect(acceptancePreview({ ...unit, caution_months: null, avance_months: null, prepaye_months: 0 })).toMatchObject({ depositMonths: 2, advance: 0, prepaidIgnored: false })
    expect(acceptancePreview({ ...unit, caution_months: 5 }).depositMonths).toBe(3)
  })
  it('date de début du bail : la date souhaitée (même passée), sinon aujourd\'hui', () => {
    expect(leaseStartIfAccepted({ desired_move_in_at: '2026-09-17' }, '2026-09-27')).toEqual({ date: '2026-09-17', past: true })
    expect(leaseStartIfAccepted({ desired_move_in_at: null }, '2026-09-27')).toEqual({ date: '2026-09-27', past: false })
  })
})

describe('baux liés au logement', () => {
  const leases = [
    { id: 'old', status: 'terminated' as const, unit_id: 'u1', unit: null, tenant: { id: 't1' }, tenant_id: 't1', created_at: '2026-01-01' },
    { id: 'draft', status: 'draft' as const, unit_id: 'u1', unit: null, tenant: { id: 't1' }, tenant_id: 't1', created_at: '2026-09-27T19:52:32Z' }
  ]
  it('repère un bail en cours ou en préparation (l\'API accepte quand même, #67)', () => {
    expect(conflictingLease(leases, 'u1')?.id).toBe('draft')
    expect(conflictingLease([leases[0]!], 'u1')).toBeNull()
    expect(conflictingLease(leases, 'u2')).toBeNull()
  })
  it('un bail en préavis ne bloque pas un emménagement après le départ', () => {
    const notice = [{ id: 'n', status: 'active' as const, unit_id: 'u1', unit: null, renewal_intent: 'leave' as const, renewal_intent_date: '2026-09-27', notice_period: 3, entry_paid_at: '2026-01-01' }]
    expect(conflictingLease(notice, 'u1', '2026-12-27')).toBeNull()
    expect(conflictingLease(notice, 'u1', '2026-11-01')?.id).toBe('n')
    expect(conflictingLease(notice, 'u1')?.id).toBe('n')
  })
  it('retrouve le brouillon créé par l\'acceptation (id non renvoyé)', () => {
    expect(draftLeaseFor(leases, 'u1', 't1')?.id).toBe('draft')
    expect(draftLeaseFor(leases, 'u1', 't2')).toBeNull()
  })
})

describe('regroupements', () => {
  it('par logement, ceux qui ont des candidats en attente d\'abord', () => {
    const g = groupByUnit([
      req({ id: 'a', unit_id: 'u2', status: 'rejected' }),
      req({ id: 'b', unit_id: 'u1', status: 'rejected', created_at: '2026-09-26T00:00:00Z' }),
      req({ id: 'c', unit_id: 'u1', status: 'pending' })
    ])
    expect(g.map(x => x.unitId)).toEqual(['u1', 'u2'])
    expect(g[0]!.requests.map(r => r.id)).toEqual(['c', 'b'])
    expect(g[0]!.pending).toBe(1)
  })
  it('dernière candidature sur un logement (repostuler après un refus)', () => {
    expect(latestRequestFor([req({ id: 'old', status: 'rejected', created_at: '2026-09-01T00:00:00Z' }), req({ id: 'new' })], 'u1')?.id).toBe('new')
    expect(latestRequestFor([], 'u1')).toBeNull()
  })
  it('visite du candidat pour ce logement : réalisée d\'abord', () => {
    const v = (id: string, status: string, tenant = 't1', unitId = 'u1') => ({ id, status, tenant_id: tenant, unit_id: unitId }) as unknown as VisitSummary
    expect(visitOf([v('p', 'pending'), v('c', 'completed'), v('x', 'completed', 't2')], 't1', 'u1')?.id).toBe('c')
    expect(visitOf([v('r', 'rejected')], 't1', 'u1')).toBeNull()
  })
})
