import { describe, expect, it } from 'vitest'
import { canCancel, canDispute, canReview, disputeSplit, interventionPhase, isMine, pendingOffer, paymentSplit, validateOffer, validateRefund, warrantyLine } from '../app/utils/artisanRequests'
import type { ArtisanOffer } from '../app/types/artisan'

describe('phases d\'une intervention (statuts réels, Lot 54)', () => {
  it('distingue garantie, litige et clôture', () => {
    expect(interventionPhase({ status: 'completed', disputed_at: null })).toBe('warranty')
    expect(interventionPhase({ status: 'completed', disputed_at: '2026-09-27T23:33:27Z' })).toBe('disputed')
    expect(interventionPhase({ status: 'closed', disputed_at: '2026-09-27T23:33:27Z' })).toBe('closed')
    expect(interventionPhase({ status: 'in_progress', disputed_at: null })).toBe('in_progress')
  })
  it('actions possibles selon la phase (règles de l\'API)', () => {
    expect(canCancel({ status: 'open' })).toBe(true)
    expect(canCancel({ status: 'agreed' })).toBe(false)
    expect(canReview({ status: 'completed' })).toBe(false)
    expect(canReview({ status: 'closed' })).toBe(true)
    const now = new Date('2026-09-28T10:00:00Z')
    const w = { status: 'completed', disputed_at: null, warranty_expires_at: '2026-10-04T23:33:25Z', retained_amount: '4000.00' }
    expect(canDispute(w, now)).toBe(true)
    expect(canDispute({ ...w, retained_amount: '0.00' }, now)).toBe(false)
    expect(canDispute({ ...w, disputed_at: '2026-09-27' }, now)).toBe(false)
    expect(canDispute({ ...w, warranty_expires_at: '2026-09-20T00:00:00Z' }, now)).toBe(false)
  })
})

describe('offres', () => {
  const o = (id: string, status: string, by: string): ArtisanOffer => ({ id, artisan_request_id: 'r', proposed_by: by, price: '20000.00', warranty_days: 7, retention_percentage: 20, status, created_at: '' })
  it('offre en attente et auteur', () => {
    const offers = [o('a', 'superseded', 'art'), o('b', 'pending', 'owner')]
    expect(pendingOffer(offers)?.id).toBe('b')
    expect(isMine(offers[1]!, 'owner')).toBe(true)
    expect(isMine(offers[1]!, 'art')).toBe(false)
  })
  it('contrôles (live : retenue 120 % → « Données invalides », prix 0 accepté par l\'API)', () => {
    expect(validateOffer({ price: '20 000', warrantyDays: '7', retention: '20' })).toBeNull()
    expect(validateOffer({ price: '0', warrantyDays: '7', retention: '20' })).toMatch(/supérieur à 0/)
    expect(validateOffer({ price: '20000', warrantyDays: '91', retention: '20' })).toMatch(/90 jours/)
    expect(validateOffer({ price: '20000', warrantyDays: '7', retention: '120' })).toMatch(/100 %/)
    expect(validateOffer({ price: '20000', warrantyDays: '0', retention: '20' })).toMatch(/garantie/)
    expect(validateOffer({ price: '5000', warrantyDays: '0', retention: '0' })).toBeNull()
  })
  it('paiement : même partage que l\'API (live : 20 000 à 20 % → 16 000 + 4 000)', () => {
    expect(paymentSplit(20000, 20)).toEqual({ immediate: 16000, retained: 4000 })
    expect(paymentSplit(5000, 0)).toEqual({ immediate: 5000, retained: 0 })
  })
})

describe('litige', () => {
  it('partage de la retenue (live : 3 000 au demandeur, 1 000 à l\'artisan sur 4 000)', () => {
    expect(disputeSplit(4000, 3000)).toEqual({ requester: 3000, artisan: 1000 })
    expect(disputeSplit(4000, 9000)).toEqual({ requester: 4000, artisan: 0 })
  })
  it('montant proposé borné par la retenue (live : 5 000 > 4 000 → 400)', () => {
    expect(validateRefund('5000', 4000)).toMatch(/dépasser la part retenue/)
    expect(validateRefund('', 4000)).toMatch(/Indiquez/)
    expect(validateRefund('0', 4000)).toBeNull()
  })
  it('ligne de garantie', () => {
    const now = new Date('2026-09-28T10:00:00Z')
    expect(warrantyLine({ warranty_expires_at: '2026-10-04T23:33:25Z' }, now)).toMatch(/garantie jusqu'au 5 octobre|garantie jusqu'au 4 octobre/)
    expect(warrantyLine({ warranty_expires_at: '2026-09-20T10:00:00Z' }, now)).toMatch(/terminée/)
    expect(warrantyLine({ warranty_expires_at: null }, now)).toBeNull()
  })
})
