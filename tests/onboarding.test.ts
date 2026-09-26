import { describe, expect, it } from 'vitest'
import { SIGNUP_ROLE_TO_API, apiRoleToSignupRole, needsOnboarding, validateIfu, validateRccm, validateSignup } from '../app/utils/onboarding'
import { errorText, mapApiError } from '../app/utils/apiErrors'
import { UPLOAD_MAX_BYTES, checkUploadFile, shouldCompress } from '../app/utils/uploadFile'

describe('SIGNUP_ROLE_TO_API / apiRoleToSignupRole', () => {
  it('envoie à l\'onboarding le vrai rôle API choisi à l\'inscription', () => {
    expect(SIGNUP_ROLE_TO_API.locataire).toBe('tenant')
    expect(SIGNUP_ROLE_TO_API.bailleur).toBe('landlord')
    expect(SIGNUP_ROLE_TO_API.artisan).toBe('artisan')
  })

  it('ramène le rôle réel à l\'écran KYC (un landlord ne voit plus les pièces locataire)', () => {
    expect(apiRoleToSignupRole('landlord')).toBe('bailleur')
    expect(apiRoleToSignupRole('agent')).toBe('bailleur')
    expect(apiRoleToSignupRole('agency')).toBe('bailleur')
    expect(apiRoleToSignupRole('artisan')).toBe('artisan')
    expect(apiRoleToSignupRole('tenant')).toBe('locataire')
  })

  it('renvoie null sans rôle exploitable (l\'appelant garde le choix local)', () => {
    expect(apiRoleToSignupRole(undefined)).toBeNull()
    expect(apiRoleToSignupRole('admin')).toBeNull()
  })
})

describe('needsOnboarding', () => {
  it('renvoie vers « Créer votre compte » une inscription abandonnée', () => {
    expect(needsOnboarding({ is_profile_complete: false, role: 'tenant' })).toBe(true)
  })
  it('laisse passer un compte finalisé, un admin, ou l\'absence d\'utilisateur', () => {
    expect(needsOnboarding({ is_profile_complete: true, role: 'landlord' })).toBe(false)
    expect(needsOnboarding({ is_profile_complete: false, role: 'admin' })).toBe(false)
    expect(needsOnboarding(null)).toBe(false)
  })
})

describe('validateSignup', () => {
  it('exige prénom et nom (espaces seuls refusés)', () => {
    expect(validateSignup({ firstName: ' ', lastName: 'Akplogan' })).toMatch(/prénom/)
    expect(validateSignup({ firstName: 'Rodrigue', lastName: '' })).toMatch(/nom/)
    expect(validateSignup({ firstName: 'Rodrigue', lastName: 'Akplogan' })).toBeNull()
  })
})

describe('validateIfu', () => {
  it('refuse ce que /onboarding/finalize laissait passer en live (« 12345 »)', () => {
    expect(validateIfu('12345')).toMatch(/13 chiffres/)
    expect(validateIfu('12345678901AB')).toMatch(/13 chiffres/)
  })
  it('accepte 13 chiffres, et un champ vide (non modifié)', () => {
    expect(validateIfu('3179043900012')).toBeNull()
    expect(validateIfu('')).toBeNull()
  })
})

describe('checkUploadFile', () => {
  it('refuse au-dessus de 4 Mo (le relais Vercel coupe vers 4,5 Mo, mesuré en live)', () => {
    expect(checkUploadFile({ type: 'application/pdf', size: UPLOAD_MAX_BYTES + 1 })).toMatch(/4 Mo/)
    expect(checkUploadFile({ type: 'application/pdf', size: 4_400_000 })).toMatch(/4 Mo/)
    expect(checkUploadFile({ type: 'application/pdf', size: 3_000_000 })).toBeNull()
  })
  it('refuse les formats que l\'API rejette (HEIC d\'iPhone, Word…)', () => {
    expect(checkUploadFile({ type: 'image/heic', size: 1000 })).toMatch(/Format/)
    expect(checkUploadFile({ type: 'application/msword', size: 1000 })).toMatch(/Format/)
    expect(checkUploadFile({ type: 'image/webp', size: 1000 })).toBeNull()
  })
})

describe('shouldCompress', () => {
  it('ne réduit que les photos lourdes, jamais un PDF', () => {
    expect(shouldCompress({ type: 'image/jpeg', size: 5_000_000 })).toBe(true)
    expect(shouldCompress({ type: 'image/jpeg', size: 800_000 })).toBe(false)
    expect(shouldCompress({ type: 'application/pdf', size: 5_000_000 })).toBe(false)
  })
})

describe('validateRccm', () => {
  it('reprend la règle du backend : l\'exemple Swagger « RB/COT/2024/B/12345 » est refusé', () => {
    expect(validateRccm('RB/COT/2024/B/12345')).toMatch(/RB\/COT\/25 A 1234/)
    expect(validateRccm('n/importe')).toMatch(/RCCM invalide/)
  })
  it('accepte le format béninois, avec ou sans espaces, et un champ vide', () => {
    expect(validateRccm('RB/COT/25 A 1234')).toBeNull()
    expect(validateRccm('RB/PNO/24B6789')).toBeNull()
    expect(validateRccm('')).toBeNull()
  })
})

describe('errorText', () => {
  it('affiche le message du champ fautif au lieu d\'un « échoué » générique (cas réel RCCM)', () => {
    const mapped = mapApiError({ statusCode: 400, error: 'VALIDATION_ERROR', message: 'Données invalides', violations: [{ field: 'rccm', rule: 'matches', defaultMessage: 'x' }] }, 400)
    expect(mapped.bannerMessage).toBeNull()
    expect(errorText(mapped, "L'enregistrement a échoué.")).toMatch(/RCCM invalide/)
  })
  it('garde la bannière quand elle existe, et le repli quand il n\'y a rien', () => {
    expect(errorText({ kind: 'conflict', fieldErrors: {}, bannerMessage: 'IFU déjà utilisé' }, 'x')).toBe('IFU déjà utilisé')
    expect(errorText({ kind: 'unknown', fieldErrors: {}, bannerMessage: null }, 'repli')).toBe('repli')
  })
})

describe('IFU déjà utilisé', () => {
  it('le 403 IFU_ALREADY_EXISTS n\'est plus présenté comme un problème de droits', () => {
    const mapped = mapApiError({ statusCode: 403, message: 'IFU_ALREADY_EXISTS' }, 403)
    expect(mapped.kind).toBe('conflict')
    expect(mapped.bannerMessage).toMatch(/déjà utilisé/)
  })
  it('idem pour RCCM_ALREADY_EXISTS (vu en live avec « RB/COT/25 A 1234 »)', () => {
    expect(mapApiError({ statusCode: 403, message: 'RCCM_ALREADY_EXISTS' }, 403).bannerMessage).toMatch(/RCCM est déjà utilisé/)
  })
  it('un 403 ordinaire reste un refus de droits', () => {
    expect(mapApiError({ statusCode: 403, message: 'Accès refusé.' }, 403).bannerMessage).toMatch(/droits/)
  })
})
