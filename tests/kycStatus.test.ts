import { describe, expect, it } from 'vitest'
import { deriveVerificationNotice } from '../app/utils/kycStatus'

describe('deriveVerificationNotice', () => {
  it('ne signale rien pour un compte vérifié', () => {
    expect(deriveVerificationNotice('verified', true, 'locataire')).toBeNull()
  })

  it('un compte neuf « pending » sans pièce d\'identité n\'est PAS « en cours d\'examen »', () => {
    const n = deriveVerificationNotice('pending', false, 'locataire')
    expect(n?.tone).toBe('warn')
    expect(n?.title).toBe('Compte non vérifié')
  })

  it('« pending » avec pièce d\'identité déposée = en cours d\'examen', () => {
    const n = deriveVerificationNotice('pending', true, 'pro')
    expect(n?.tone).toBe('info')
    expect(n?.title).toBe('Vérification en cours')
    expect(n?.text).toContain('publier un bien')
  })

  it('un refus est signalé en danger, avec l\'action de redépôt', () => {
    const n = deriveVerificationNotice('rejected', true, 'artisan')
    expect(n?.tone).toBe('danger')
    expect(n?.cta).toBe('Redéposer mes documents')
    expect(n?.text).toContain('retirer vos gains')
  })

  it('un statut absent ou inconnu est traité comme non vérifié', () => {
    expect(deriveVerificationNotice(undefined, undefined, 'locataire')?.title).toBe('Compte non vérifié')
    expect(deriveVerificationNotice('something_new', false, 'pro')?.title).toBe('Compte non vérifié')
  })
})
