import { describe, expect, it } from 'vitest'
import { decideSessionOutcome } from '../app/utils/sessionOutcome'
import type { AuthUser } from '../app/types/auth'

function baseUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: 'u1',
    email: 'koffi.dossou@gmail.com',
    role: 'landlord',
    is_profile_complete: true,
    is_verified: true,
    has_password: true,
    ...overrides
  }
}

describe('decideSessionOutcome', () => {
  it('un utilisateur actif est accepté tel quel', () => {
    const outcome = decideSessionOutcome(baseUser({ status: 'active' }))
    expect(outcome.kind).toBe('ok')
  })

  it('un compte banni est rejeté avec un message distinct d\'une session expirée', () => {
    const outcome = decideSessionOutcome(baseUser({ status: 'banned' }))
    expect(outcome.kind).toBe('banned')
    if (outcome.kind === 'banned') {
      expect(outcome.message).toContain('suspendu')
      expect(outcome.message).not.toMatch(/expir/i)
    }
  })

  it('un compte restreint est laissé passer mais signalé à l\'appelant', () => {
    const outcome = decideSessionOutcome(baseUser({ status: 'restricted' }))
    expect(outcome.kind).toBe('restricted')
  })

  it('GET /auth/me en 404 (compte tout juste créé) donne "pending", pas une erreur', () => {
    const outcome = decideSessionOutcome(null)
    expect(outcome.kind).toBe('pending')
  })

  it('transmet isNewUser (venu de verify-otp/google, jamais de /auth/me) à l\'appelant', () => {
    const fresh = decideSessionOutcome(baseUser({ status: 'active' }), true)
    expect(fresh.kind).toBe('ok')
    if (fresh.kind === 'ok') expect(fresh.isNewUser).toBe(true)

    const existing = decideSessionOutcome(baseUser({ status: 'active' }), false)
    if (existing.kind === 'ok') expect(existing.isNewUser).toBe(false)
  })
})
