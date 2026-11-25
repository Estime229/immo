import { describe, expect, it } from 'vitest'
import { buildActivityFeed, buildNextSteps, findLateLeaseInvoice, findUpcomingLeaseInvoice, upcomingRentStepKey } from '../app/utils/tenantDashboard'
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

  it('une échéance due aujourd\'hui n\'est pas encore en retard (même règle que l\'échéancier)', () => {
    const leases = [lease({ invoices: [{ id: 'inv1', amount: '75000.00', due_date: '2026-11-25', status: 'pending' }] })]
    expect(findLateLeaseInvoice(leases, new Date('2026-11-25T18:00:00'))).toBeNull()
    expect(findLateLeaseInvoice(leases, new Date('2026-11-26T08:00:00'))?.invoice.id).toBe('inv1')
  })
})

describe('findUpcomingLeaseInvoice', () => {
  // Heure locale : les échéances se comparent au jour local, comme dans l'échéancier.
  const now = new Date('2026-11-25T10:00:00')

  it('trouve une échéance payable due dans les 7 jours', () => {
    const leases = [lease({ invoices: [{ id: 'inv1', amount: '90000.00', due_date: '2026-11-30', status: 'pending' }] })]
    expect(findUpcomingLeaseInvoice(leases, now)?.invoice.id).toBe('inv1')
  })

  it('compte le jour même et le 7e jour, pas au-delà', () => {
    const today = [lease({ invoices: [{ id: 'a', amount: '1', due_date: '2026-11-25', status: 'pending' }] })]
    const day7 = [lease({ invoices: [{ id: 'b', amount: '1', due_date: '2026-12-02', status: 'pending' }] })]
    const day8 = [lease({ invoices: [{ id: 'c', amount: '1', due_date: '2026-12-03', status: 'pending' }] })]
    expect(findUpcomingLeaseInvoice(today, now)?.invoice.id).toBe('a')
    expect(findUpcomingLeaseInvoice(day7, now)?.invoice.id).toBe('b')
    expect(findUpcomingLeaseInvoice(day8, now)).toBeNull()
    expect(findUpcomingLeaseInvoice(day8, now, 10)?.invoice.id).toBe('c')
  })

  it('ignore une échéance déjà échue, payée, annulée ou marquée en retard par le serveur', () => {
    const leases = [lease({
      invoices: [
        { id: 'late', amount: '1', due_date: '2026-11-24', status: 'pending' },
        { id: 'paid', amount: '1', due_date: '2026-11-27', status: 'paid' },
        { id: 'cancelled', amount: '1', due_date: '2026-11-27', status: 'cancelled' },
        { id: 'overdue', amount: '1', due_date: '2026-11-27', status: 'overdue' }
      ]
    })]
    expect(findUpcomingLeaseInvoice(leases, now)).toBeNull()
  })

  it("ignore une échéance encore en attente sur un bail qui n'est pas actif", () => {
    const pending = [{ id: 'inv1', amount: '90000.00', due_date: '2026-11-30', status: 'pending' as const }]
    for (const status of ['signed', 'pending_signature', 'terminated'] as const) {
      expect(findUpcomingLeaseInvoice([lease({ status, invoices: pending })], now)).toBeNull()
    }
    expect(findUpcomingLeaseInvoice([lease({ status: 'active', invoices: pending })], now)?.invoice.id).toBe('inv1')
  })

  it('garde un paiement partiel à venir (le reste est dû)', () => {
    const leases = [lease({ invoices: [{ id: 'part', amount: '90000.00', due_date: '2026-11-28', status: 'partially_paid' }] })]
    expect(findUpcomingLeaseInvoice(leases, now)?.invoice.id).toBe('part')
  })

  it('choisit la plus proche, tous baux confondus, quel que soit l\'ordre de l\'API', () => {
    const leases = [
      lease({ id: 'l1', invoices: [{ id: 'far', amount: '1', due_date: '2026-12-01', status: 'pending' }] }),
      lease({ id: 'l2', invoices: [{ id: 'later', amount: '1', due_date: '2026-11-30', status: 'pending' }, { id: 'near', amount: '1', due_date: '2026-11-27', status: 'pending' }] })
    ]
    const found = findUpcomingLeaseInvoice(leases, now)
    expect(found?.invoice.id).toBe('near')
    expect(found?.lease.id).toBe('l2')
  })

  it('ne se confond jamais avec le loyer en retard', () => {
    const leases = [lease({ invoices: [{ id: 'late', amount: '1', due_date: '2026-11-20', status: 'pending' }, { id: 'next', amount: '1', due_date: '2026-11-29', status: 'pending' }] })]
    expect(findLateLeaseInvoice(leases, now)?.invoice.id).toBe('late')
    expect(findUpcomingLeaseInvoice(leases, now)?.invoice.id).toBe('next')
  })

  it('retourne null sans bail ni échéance', () => {
    expect(findUpcomingLeaseInvoice([], now)).toBeNull()
    expect(findUpcomingLeaseInvoice([lease({ invoices: undefined })], now)).toBeNull()
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

  it('ne propose rien pour un bail déjà actif sans échéance proche', () => {
    const steps = buildNextSteps({ ...empty, leases: [lease({ status: 'active' })] })
    expect(steps).toHaveLength(0)
    const far = lease({ status: 'active', invoices: [{ id: 'inv1', amount: '90000.00', due_date: '2026-12-20', status: 'pending' }] })
    expect(buildNextSteps({ ...empty, leases: [far] }, new Date('2026-11-25T10:00:00'))).toHaveLength(0)
  })

  it('propose de payer le loyer à venir d\'un bail actif, vers le paiement de cette échéance', () => {
    const active = lease({ status: 'active', invoices: [{ id: 'inv9', amount: '90000.00', due_date: '2026-11-30', status: 'pending' }] })
    const steps = buildNextSteps({ ...empty, leases: [active] }, new Date('2026-11-25T10:00:00'))
    expect(steps).toHaveLength(1)
    expect(steps[0]!.key).toBe(upcomingRentStepKey('inv9'))
    expect(steps[0]!.kind).toBe('pay')
    expect(steps[0]!.to).toBe('/locataire/bail?lease=l1&pay=inv9')
    expect(steps[0]!.label).toContain('Unité A2')
    expect(steps[0]!.hint).toMatch(/90\s000 F/)
  })

  it('ne propose pas de loyer à venir pour un loyer déjà en retard (la bannière s\'en charge)', () => {
    const active = lease({ status: 'active', invoices: [{ id: 'inv9', amount: '90000.00', due_date: '2026-11-20', status: 'pending' }] })
    expect(buildNextSteps({ ...empty, leases: [active] }, new Date('2026-11-25T10:00:00'))).toHaveLength(0)
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
    expect(steps[0]!.to).toBe('/locataire/demandes?request=hr1')
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
