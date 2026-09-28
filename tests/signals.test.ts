import { describe, expect, it } from 'vitest'
import { canAddAttachments, canTenantCancel, isStaleTransition, landlordActions, reportableLeases, signalAuthor, signalPlace, sortSignals, tenantStep } from '../app/utils/signals'
import type { SignalStatus } from '../app/types/tenant'

describe('transitions propriétaire (matrice relevée en live)', () => {
  const targets = (s: SignalStatus) => landlordActions(s).map(a => a.to)
  it('ne propose que les transitions acceptées par l\'API', () => {
    expect(targets('open')).toEqual(['in_review', 'closed'])
    expect(targets('in_review')).toEqual(['resolved', 'open'])
    expect(targets('resolved')).toEqual(['closed', 'open'])
    expect(targets('closed')).toEqual([])
    expect(targets('cancelled')).toEqual([])
  })
  it('jamais open → resolved ni in_review → closed (400 en live)', () => {
    expect(targets('open')).not.toContain('resolved')
    expect(targets('in_review')).not.toContain('closed')
  })
  it('demande la note de résolution au passage à « résolu »', () => {
    expect(landlordActions('in_review').find(a => a.to === 'resolved')?.needsNote).toBe(true)
  })
})

describe('côté locataire', () => {
  it('annule seulement un signalement encore ouvert (403/400 sinon)', () => {
    expect(canTenantCancel({ status: 'open' })).toBe(true)
    expect(canTenantCancel({ status: 'in_review' })).toBe(false)
  })
  it('ajoute des photos tant que ce n\'est pas résolu', () => {
    expect(canAddAttachments({ status: 'in_review' })).toBe(true)
    expect(canAddAttachments({ status: 'resolved' })).toBe(false)
  })
  it('suit 4 étapes calquées sur les statuts', () => {
    expect([tenantStep('open'), tenantStep('in_review'), tenantStep('resolved'), tenantStep('closed'), tenantStep('cancelled')]).toEqual([1, 2, 3, 4, 0])
  })
  it('ne propose que les baux actifs', () => {
    expect(reportableLeases([{ status: 'draft' }, { status: 'signed' }, { status: 'active' }, { status: 'terminated' }])).toEqual([{ status: 'active' }])
  })
})

describe('affichage', () => {
  it('trie en cours d\'abord puis du plus récent', () => {
    const list = [
      { id: 'a', status: 'closed' as const, created_at: '2026-09-28' },
      { id: 'b', status: 'open' as const, created_at: '2026-09-20' },
      { id: 'c', status: 'resolved' as const, created_at: '2026-09-25' }
    ]
    expect(sortSignals(list).map(s => s.id)).toEqual(['c', 'b', 'a'])
  })
  it('nomme le logement et le déclarant depuis les objets imbriqués', () => {
    expect(signalPlace({ unit: { id: 'u', name: 'Appart 4' }, property: { id: 'p', name: 'Résidence QA' } })).toBe('Appart 4 — Résidence QA')
    expect(signalPlace({ unit: null, property: null })).toBe('Logement')
    expect(signalAuthor({ author: { id: 'x', first_name: 'Awa', last_name: 'K.', email: 'a@x.bj' } })).toBe('Awa K.')
    expect(signalAuthor({ author: { id: 'x', first_name: null, last_name: null, email: 'a@x.bj' } })).toBe('a@x.bj')
  })
  it('reconnaît une transition devenue impossible', () => {
    expect(isStaleTransition('Transition impossible : cancelled → resolved')).toBe(true)
    expect(isStaleTransition('Accès non autorisé')).toBe(false)
  })
})
