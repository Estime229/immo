import { describe, expect, it } from 'vitest'
import { deriveVerificationNotice, verificationGateCopy, verificationLink, verificationStage } from '../app/utils/kycStatus'

describe('verificationStage', () => {
  it('suit `is_verified`, comme l\'API — même si `kyc_status` est repassé à « pending » après une modification du profil', () => {
    expect(verificationStage({ is_verified: true, profile: { kyc_status: 'pending' } })).toBe('verified')
  })

  it('un compte neuf (`is_verified: false`, « pending », rien déposé) est « à faire », pas « en cours »', () => {
    expect(verificationStage({ is_verified: false, profile: { kyc_status: 'pending' } })).toBe('todo')
  })

  it('« pending » avec un dossier déposé = en cours d\'examen', () => {
    expect(verificationStage({ is_verified: false, profile: { kyc_status: 'pending' } }, true)).toBe('review')
    expect(verificationStage({ is_verified: false, profile: { kyc_status: 'in_review' } }, true)).toBe('review')
  })

  it('un refus reste un refus, dossier déposé ou non', () => {
    expect(verificationStage({ is_verified: false, profile: { kyc_status: 'rejected' } }, true)).toBe('rejected')
  })

  it('`kyc_status: verified` sans `is_verified` ne donne AUCUN droit (c\'est `is_verified` que lit l\'API)', () => {
    expect(verificationStage({ is_verified: false, profile: { kyc_status: 'verified' } })).toBe('todo')
  })

  it('l\'admin est toujours considéré comme vérifié, comme dans VerifiedUserGuard', () => {
    expect(verificationStage({ role: 'admin', is_verified: false })).toBe('verified')
  })

  it('sans utilisateur ou statut inconnu : à faire', () => {
    expect(verificationStage(null)).toBe('todo')
    expect(verificationStage({ is_verified: false, profile: { kyc_status: 'something_new' } }, true)).toBe('todo')
  })
})

describe('deriveVerificationNotice', () => {
  it('ne signale rien pour un compte vérifié', () => {
    expect(deriveVerificationNotice('verified', 'locataire')).toBeNull()
  })

  it('cite les actions réellement bloquées par l\'API — sans les retraits, qui ne le sont pas', () => {
    const pro = deriveVerificationNotice('todo', 'pro')
    expect(pro?.title).toBe('Compte non vérifié')
    expect(pro?.text).toContain('publier ou modifier un bien')
    expect(pro?.text).not.toContain('retirer')
    expect(deriveVerificationNotice('todo', 'locataire')?.text).toContain('demander une visite ni candidater')
  })

  it('en cours d\'examen : bleu, suivi du dossier', () => {
    const n = deriveVerificationNotice('review', 'pro')
    expect(n?.tone).toBe('info')
    expect(n?.cta).toBe('Suivre ma vérification')
  })

  it('refus : rouge, redépôt', () => {
    const n = deriveVerificationNotice('rejected', 'locataire')
    expect(n?.tone).toBe('danger')
    expect(n?.cta).toBe('Redéposer mes documents')
  })

  it('artisan : rien n\'est bloqué, le message ne prétend pas le contraire', () => {
    const n = deriveVerificationNotice('todo', 'artisan')
    expect(n?.text).not.toContain('vous ne pouvez pas')
    expect(n?.text).toContain('profil vérifié')
  })
})

describe('verificationGateCopy / verificationLink', () => {
  it('reprend l\'action touchée dans le texte', () => {
    expect(verificationGateCopy('todo', 'publier un bien').text).toContain('avant de publier un bien')
    expect(verificationGateCopy('review', 'demander une visite').text).toContain('Vous pourrez demander une visite')
    expect(verificationGateCopy('rejected', 'candidater à un logement').cta).toBe('Redéposer mes documents')
  })

  it('ramène à la page d\'origine après le parcours', () => {
    expect(verificationLink()).toBe('/kyc')
    expect(verificationLink('/biens/abc?unit=1')).toBe('/kyc?redirect=%2Fbiens%2Fabc%3Funit%3D1')
  })
})
