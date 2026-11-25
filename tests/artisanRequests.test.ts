import { describe, expect, it } from 'vitest'
import { canCancel, canDispute, canReview, disputeSplit, interventionPhase, isMine, missionTitle, pendingOffer, paymentSplit, validateOffer, validateRefund, warrantyLine } from '../app/utils/artisanRequests'
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

describe('titre d\'une mission', () => {
  it('reprend le problème décrit plutôt que le métier', () => {
    expect(missionTitle('Fuite sous l\'évier de la cuisine, l\'eau coule en continu.', 'Intervention'))
      .toEqual({ text: 'Fuite sous l\'évier de la cuisine, l\'eau coule en continu', complete: true })
  })
  it('garde la première phrase et signale qu\'il reste du texte', () => {
    expect(missionTitle('Prise du salon qui grésille. Elle chauffe quand on branche le fer.', 'Électricité'))
      .toEqual({ text: 'Prise du salon qui grésille', complete: false })
  })
  it('garde la première ligne d\'une description sur plusieurs lignes', () => {
    expect(missionTitle('Porte d\'entrée bloquée\nLa clé tourne dans le vide', 'Serrurerie').text).toBe('Porte d\'entrée bloquée')
  })
  it('ne coupe ni sur une abréviation ni sur un nombre décimal', () => {
    expect(missionTitle('M. Kossi signale une fuite au plafond. Merci.', 'X').text).toBe('M. Kossi signale une fuite au plafond')
    expect(missionTitle('Urgent. Plus d\'eau chaude depuis hier', 'X').text).toBe('Urgent. Plus d\'eau chaude depuis hier')
    expect(missionTitle('Fissure de 2.5 m sur le mur de la chambre', 'X').text).toBe('Fissure de 2.5 m sur le mur de la chambre')
  })
  it('tronque proprement sur un mot vers 60 caractères', () => {
    const long = 'Infiltration d\'eau importante par la toiture au-dessus de la chambre principale et du couloir'
    const { text, complete } = missionTitle(long, 'X')
    expect(text.endsWith('…')).toBe(true)
    expect(text.length).toBeLessThanOrEqual(61)
    expect(long.startsWith(text.slice(0, -1))).toBe(true)
    expect(text.slice(0, -1).endsWith(' ')).toBe(false)
    expect(complete).toBe(false)
  })
  it('coupe net un mot unique démesuré', () => {
    expect(missionTitle('a'.repeat(80), 'X').text).toBe(`${'A'}${'a'.repeat(59)}…`)
  })
  it('met une majuscule et normalise les espaces', () => {
    expect(missionTitle('  robinet   qui goutte  ', 'X')).toEqual({ text: 'Robinet qui goutte', complete: true })
  })
  it('retombe sur le métier sans description', () => {
    expect(missionTitle('', 'Plomberie')).toEqual({ text: 'Plomberie', complete: true })
    expect(missionTitle(undefined, 'Intervention').text).toBe('Intervention')
    expect(missionTitle('   ', 'Plomberie').text).toBe('Plomberie')
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
