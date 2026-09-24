import { describe, expect, it } from 'vitest'
import { buildActivityFeed, buildNextSteps, findLateLeaseInvoice } from '../app/utils/tenantDashboard'
import type { BookingSummary, HousingRequestSummary, LeaseSummary, NotificationItem, SignalSummary, WaitlistEntry } from '../app/types/tenant'

function lease(overrides: Partial<LeaseSummary> = {}): LeaseSummary {
  return {
    id: 'l1',
    status: 'active',
    monthly_rent: '75000.00',
    deposit_amount: '150000.00',
    start_date: '2026-01-01',
    end_date: '2026-12-31',
    auto_debit_enabled: false,
    contract_type: 'standard',
    tenant: { id: 't1' },
    landlord: { id: 'll1' },
    property: { id: 'p1', name: 'Résidence Étoile' },
    unit: { id: 'u1', name: 'Unité A2' },
    invoices: [],
    ...overrides
  }
}

describe('findLateLeaseInvoice', () => {
  it('trouve une facture impayée et échue', () => {
    const leases = [
      lease({
        invoices: [{ id: 'inv1', amount: '75000.00', due_date: '2026-01-05', status: 'pending' }]
      })
    ]
    const result = findLateLeaseInvoice(leases, new Date('2026-02-01'))
    expect(result?.invoice.id).toBe('inv1')
  })

  it('ignore une facture payée même si sa date est passée', () => {
    const leases = [
      lease({ invoices: [{ id: 'inv1', amount: '75000.00', due_date: '2026-01-05', status: 'paid' }] })
    ]
    expect(findLateLeaseInvoice(leases, new Date('2026-02-01'))).toBeNull()
  })

  it('ignore une facture impayée mais pas encore échue', () => {
    const leases = [
      lease({ invoices: [{ id: 'inv1', amount: '75000.00', due_date: '2026-03-05', status: 'pending' }] })
    ]
    expect(findLateLeaseInvoice(leases, new Date('2026-02-01'))).toBeNull()
  })

  it('retourne null sans bail', () => {
    expect(findLateLeaseInvoice([])).toBeNull()
  })
})

describe('buildNextSteps', () => {
  const empty = { leases: [], bookings: [], housingRequests: [], waitlist: [] }

  it('propose de signer un bail en attente de signature', () => {
    const steps = buildNextSteps({ ...empty, leases: [lease({ status: 'pending_signature' })] })
    expect(steps).toHaveLength(1)
    expect(steps[0]!.cta).toBe('Signer')
  })

  it('propose de payer l\'entrée pour un bail signé mais pas encore actif (pas de doublon avec "actif")', () => {
    const steps = buildNextSteps({ ...empty, leases: [lease({ status: 'signed' })] })
    expect(steps).toHaveLength(1)
    expect(steps[0]!.label).toContain("Payer l'entrée")
  })

  it('ne propose rien pour un bail déjà actif', () => {
    const steps = buildNextSteps({ ...empty, leases: [lease({ status: 'active' })] })
    expect(steps).toHaveLength(0)
  })

  it('propose de payer une réservation en attente de paiement', () => {
    const booking: BookingSummary = {
      id: 'b1', unit_id: 'u1', check_in: '2026-09-20', check_out: '2026-09-22', nights: 2,
      total_price: '44000.00', status: 'pending_payment', unit: { id: 'u1', name: 'Studio B1' }
    }
    const steps = buildNextSteps({ ...empty, bookings: [booking] })
    expect(steps).toHaveLength(1)
    expect(steps[0]!.cta).toBe('Payer')
  })

  it('signale une place de liste d\'attente disponible seulement si notified_at est posé', () => {
    const notNotified: WaitlistEntry = {
      id: 'w1', unit_id: 'u1', message: '', notified_at: null, created_at: '2026-07-01',
      unit: { id: 'u1', name: 'Studio Calavi', price: '40000.00', unit_status: 'occupied' }
    }
    const notified: WaitlistEntry = { ...notNotified, id: 'w2', notified_at: '2026-09-01T00:00:00.000Z' }

    expect(buildNextSteps({ ...empty, waitlist: [notNotified] })).toHaveLength(0)
    expect(buildNextSteps({ ...empty, waitlist: [notified] })).toHaveLength(1)
  })

  it('signale les réponses reçues à une demande de logement ouverte', () => {
    const hr: HousingRequestSummary = { id: 'hr1', description: 'Studio à Fidjrossè', status: 'open', response_count: 3, created_at: '2026-07-01' }
    const steps = buildNextSteps({ ...empty, housingRequests: [hr] })
    expect(steps[0]!.label).toContain('3 réponses')
  })

  it('cumule les étapes de plusieurs sources', () => {
    const steps = buildNextSteps({
      leases: [lease({ status: 'pending_signature' })],
      bookings: [{ id: 'b1', unit_id: 'u1', check_in: '2026-09-20', check_out: '2026-09-22', nights: 2, total_price: '44000.00', status: 'pending_payment', unit: { id: 'u1', name: 'Studio B1' } }],
      housingRequests: [],
      waitlist: []
    })
    expect(steps).toHaveLength(2)
  })
})

describe('buildActivityFeed', () => {
  const localize = (f: Record<string, string> | undefined | null) => f?.fr ?? ''

  const signal: SignalSummary = {
    id: 's1', author_id: 't1', landlord_id: 'll1', unit_id: 'u1', property_id: 'p1', lease_id: 'l1',
    signal_type: 'maintenance_plomberie', priority: 'medium', title: 'Fuite d\'eau', description: '',
    attachment_count: 0, visibility: 'private', status: 'open',
    resolved_by: null, resolved_at: null, resolution_notes: null, assigned_to: null,
    created_at: '2026-09-03T10:00:00.000Z'
  }
  const notification: NotificationItem = {
    id: 'n1', title: { fr: 'Nouveau message' }, message: { fr: 'Koffi vous a écrit' },
    type: 'INFO', isRead: false, createdAt: '2026-09-10T10:00:00.000Z'
  }

  it('fusionne signalements et notifications triés du plus récent au plus ancien', () => {
    const feed = buildActivityFeed([signal], [notification], localize)
    expect(feed[0]!.key).toBe('notif-n1')
    expect(feed[1]!.key).toBe('signal-s1')
  })

  it('utilise le repli de localisation plutôt que d\'afficher un objet brut', () => {
    const feed = buildActivityFeed([], [notification], localize)
    expect(feed[0]!.label).toBe('Nouveau message')
  })

  it('tronque à la limite demandée', () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ ...notification, id: `n${i}`, createdAt: `2026-09-${10 + i}T00:00:00.000Z` }))
    expect(buildActivityFeed([], many, localize, 3)).toHaveLength(3)
  })
})
