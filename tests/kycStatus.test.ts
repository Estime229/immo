import { describe, expect, it } from 'vitest'
import { deriveKycStatusBanner } from '../app/utils/kycStatus'

describe('deriveKycStatusBanner', () => {
  it('affiche une confirmation verte pour un statut vérifié', () => {
    const b = deriveKycStatusBanner('verified')
    expect(b.tone).toBe('ok')
  })

  it('traite pending et in_review comme "en cours"', () => {
    expect(deriveKycStatusBanner('pending').tone).toBe('warn')
    expect(deriveKycStatusBanner('in_review').tone).toBe('warn')
  })

  it('signale un rejet distinctement, avec une invitation à redéposer', () => {
    const b = deriveKycStatusBanner('rejected')
    expect(b.tone).toBe('danger')
    expect(b.text).toContain('redéposez')
  })

  it('retombe sur un état neutre pour une valeur absente ou inconnue, jamais une erreur', () => {
    expect(deriveKycStatusBanner(null).tone).toBe('neutral')
    expect(deriveKycStatusBanner(undefined).tone).toBe('neutral')
    expect(deriveKycStatusBanner('some-future-status').tone).toBe('neutral')
  })
})
