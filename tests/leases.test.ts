import { describe, expect, it } from 'vitest'
import {
  cancelUnpaidState, canTenantSign, departureIfNoticeToday, depositExceedsCap, entryBreakdown, invoiceView, leasePhase,
  leaseStepIndex, nextPayableInvoice, noticeDepartureDate, pickDefaultLease, sortInvoices, startDateWarning, validateLeaseForm
} from '../app/utils/leases'

const TENANT = '1bcbc2ad-0f7f-4300-a073-6c8abae519e1'

describe('leasePhase — le statut seul ne suffit pas (vérifié en live, Lot 50)', () => {
  it('distingue préavis, annulation pour impayé et statut incohérent', () => {
    expect(leasePhase({ status: 'draft' })).toBe('draft')
    expect(leasePhase({ status: 'pending_signature' })).toBe('awaiting_tenant')
    expect(leasePhase({ status: 'signed', entry_paid_at: null })).toBe('awaiting_entry')
    expect(leasePhase({ status: 'active', renewal_intent: null })).toBe('active')
    expect(leasePhase({ status: 'active', renewal_intent: 'undecided' })).toBe('active')
    expect(leasePhase({ status: 'active', renewal_intent: 'leave' })).toBe('notice')
    expect(leasePhase({ status: 'terminated', entry_paid_at: '2026-09-27T18:46:32Z' })).toBe('terminated')
    expect(leasePhase({ status: 'terminated', entry_paid_at: null })).toBe('cancelled_unpaid')
    // Bail actif re-signé par le locataire : l'API le repasse `signed` alors que l'entrée est payée (#55).
    expect(leasePhase({ status: 'signed', entry_paid_at: '2026-09-27T18:46:32Z' })).toBe('inconsistent')
  })
  it('étape du fil d\'avancement', () => {
    expect(leaseStepIndex('draft')).toBe(1)
    expect(leaseStepIndex('awaiting_entry')).toBe(3)
    expect(leaseStepIndex('notice')).toBe(5)
    expect(leaseStepIndex('terminated')).toBe(6)
  })
})

describe('canTenantSign — l\'API accepte de signer un brouillon ou un bail actif (#54, #55)', () => {
  it('seulement un bail envoyé, pas encore signé par le locataire', () => {
    expect(canTenantSign({ status: 'pending_signature', signed_at_tenant: null })).toBe(true)
    expect(canTenantSign({ status: 'draft', signed_at_tenant: null })).toBe(false)
    expect(canTenantSign({ status: 'active', signed_at_tenant: '2026-09-01T00:00:00Z' })).toBe(false)
    expect(canTenantSign({ status: 'pending_signature', signed_at_tenant: '2026-09-01T00:00:00Z' })).toBe(false)
  })
})

describe('préavis — renewal_intent_date est la date du préavis, pas du départ', () => {
  it('départ = date du préavis + préavis du bail (réponse live : 27/09 + 3 mois = 27/12)', () => {
    expect(noticeDepartureDate({ renewal_intent: 'leave', renewal_intent_date: '2026-09-27', notice_period: 3 })).toBe('2026-12-27')
    expect(noticeDepartureDate({ renewal_intent: 'leave', renewal_intent_date: '2026-09-27', notice_period: 1 })).toBe('2026-10-27')
    expect(noticeDepartureDate({ renewal_intent: 'undecided', renewal_intent_date: null, notice_period: 3 })).toBeNull()
  })
  it('préavis par défaut de 3 mois si absent', () => {
    expect(noticeDepartureDate({ renewal_intent: 'leave', renewal_intent_date: '2026-01-15', notice_period: null })).toBe('2026-04-15')
    expect(departureIfNoticeToday(2, new Date('2026-09-27T10:00:00'))).toBe('2026-11-27')
  })
})

describe('entryBreakdown', () => {
  it('caution + avance + prépayé (valeurs live : 15 000 + 10 000 + 0 = 25 000)', () => {
    expect(entryBreakdown({ deposit_amount: '15000.00', advance_target: '10000.00', prepaid_target: '0.00' })).toEqual({ deposit: 15000, advance: 10000, prepaid: 0, total: 25000 })
    expect(entryBreakdown({ deposit_amount: 20000 }).total).toBe(20000)
  })
})

describe('cancelUnpaidState — 72 h après la signature du locataire (règle API)', () => {
  const signed = { status: 'signed' as const, entry_paid_at: null, signed_at_tenant: '2026-09-27T10:00:00Z' }
  it('compte les heures restantes puis autorise', () => {
    expect(cancelUnpaidState(signed, new Date('2026-09-27T12:00:00Z'))).toEqual({ allowed: false, hoursLeft: 70 })
    expect(cancelUnpaidState(signed, new Date('2026-09-30T10:00:01Z'))).toEqual({ allowed: true, hoursLeft: 0 })
  })
  it('sans objet hors de la phase « entrée non payée »', () => {
    expect(cancelUnpaidState({ status: 'active' })).toBeNull()
    expect(cancelUnpaidState({ ...signed, entry_paid_at: '2026-09-27T11:00:00Z' })).toBeNull()
  })
})

describe('invoiceView — statuts réels (pas de « late »)', () => {
  const now = new Date('2026-09-27T12:00:00')
  it('libellés et factures payables', () => {
    expect(invoiceView({ status: 'paid', due_date: '2026-09-01' }, now)).toMatchObject({ label: 'Payé', payable: false })
    expect(invoiceView({ status: 'overdue', due_date: '2026-09-01' }, now)).toMatchObject({ label: 'En retard', payable: true })
    expect(invoiceView({ status: 'pending', due_date: '2026-09-24' }, now)).toMatchObject({ label: 'En retard', tone: 'danger' })
    expect(invoiceView({ status: 'pending', due_date: '2026-10-01' }, now)).toMatchObject({ label: 'À payer', tone: 'warn' })
    expect(invoiceView({ status: 'cancelled', due_date: '2026-09-01' }, now).payable).toBe(false)
    expect(invoiceView({ status: 'refunded', due_date: '2026-09-01' }, now).payable).toBe(false)
  })
  it('paye la plus ancienne due, pas la première de l\'API (ordre décroissant)', () => {
    const invs = [
      { id: 'c', status: 'pending', due_date: '2026-11-01' },
      { id: 'b', status: 'overdue', due_date: '2026-10-01' },
      { id: 'a', status: 'paid', due_date: '2026-09-01' }
    ]
    expect(nextPayableInvoice(invs, now)?.id).toBe('b')
    expect(sortInvoices(invs).map(i => i.id)).toEqual(['a', 'b', 'c'])
    expect(nextPayableInvoice([{ id: 'a', status: 'paid', due_date: '2026-09-01' }], now)).toBeNull()
  })
})

describe('validateLeaseForm — contrôles absents de l\'API (live : date invalide → 500, fin avant début acceptée)', () => {
  const ok = { tenantId: TENANT, unitId: 'u1', rent: '10000', deposit: '20000', startDate: '2026-10-01', endDate: '', noticePeriod: '3' }
  it('accepte un bail valide', () => {
    expect(validateLeaseForm(ok)).toBeNull()
    expect(validateLeaseForm({ ...ok, deposit: '0', endDate: '2027-09-30' })).toBeNull()
  })
  it('refuse les cas acceptés à tort par l\'API', () => {
    expect(validateLeaseForm({ ...ok, startDate: 'abc' })).toMatch(/date de début/)
    expect(validateLeaseForm({ ...ok, endDate: '2026-09-01' })).toMatch(/après la date de début/)
    expect(validateLeaseForm({ ...ok, rent: '0' })).toMatch(/supérieur à 0/)
    expect(validateLeaseForm({ ...ok, noticePeriod: '0' })).toMatch(/1 et 12/)
  })
  it('champs requis et formats', () => {
    expect(validateLeaseForm({ ...ok, tenantId: '' })).toMatch(/locataire/)
    expect(validateLeaseForm({ ...ok, tenantId: 'pas-un-uuid' })).toMatch(/identifiant/)
    expect(validateLeaseForm({ ...ok, unitId: '' })).toMatch(/logement/)
    expect(validateLeaseForm({ ...ok, deposit: '1.5' })).toMatch(/caution/)
  })
  it('date de début passée : avertissement, pas un blocage', () => {
    expect(startDateWarning('2026-07-01', '2026-09-27')).toMatch(/facturées/)
    expect(startDateWarning('2026-09-27', '2026-09-27')).toBeNull()
  })
  it('plafond de caution (Loi 2022-30), bail mensuel seulement', () => {
    expect(depositExceedsCap('monthly', 10000, 30000)).toBe(false)
    expect(depositExceedsCap('monthly', 10000, 30001)).toBe(true)
    expect(depositExceedsCap('weekly', 10000, 90000)).toBe(false)
  })
})

describe('pickDefaultLease — un brouillon récent ne masque plus le bail actif', () => {
  it('priorité à ce qui attend une action, puis à l\'actif', () => {
    const leases = [
      { id: 'draft', status: 'draft' as const },
      { id: 'active', status: 'active' as const },
      { id: 'old', status: 'terminated' as const, entry_paid_at: '2026-01-01' }
    ]
    expect(pickDefaultLease(leases)?.id).toBe('active')
    expect(pickDefaultLease([...leases, { id: 'sign', status: 'pending_signature' as const }])?.id).toBe('sign')
    expect(pickDefaultLease([])).toBeNull()
  })
})
