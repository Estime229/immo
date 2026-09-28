import { describe, expect, it } from 'vitest'
import { asStep, blockReason, checklist, coordErrors, ID_TYPES, idTypeOf, missingSides, nextStep, prevStep, progressIndex, ROLE_DOCS, stackLayout } from '../app/utils/kycWizard'

const base = { idType: null, idCardOnFile: false, keepExistingCard: false, missingSides: [], docCount: 0, coordValid: true } as const

describe('enchaînement des étapes', () => {
  it('avance et recule dans l\'ordre, termine sur « envoyé »', () => {
    expect(nextStep('intro')).toBe('piece')
    expect(nextStep('piece')).toBe('photos')
    expect(nextStep('recap')).toBe('envoye')
    expect(prevStep('documents')).toBe('photos')
    expect(prevStep('piece')).toBe('intro')
  })
  it('lit l\'étape dans l\'URL, avec repli sur l\'introduction', () => {
    expect(asStep('documents')).toBe('documents')
    expect(asStep('nimporte')).toBe('intro')
    expect(asStep(undefined)).toBe('intro')
  })
  it('regroupe les deux écrans de la pièce dans le même segment de progression', () => {
    expect([progressIndex('piece'), progressIndex('photos'), progressIndex('documents'), progressIndex('recap')]).toEqual([0, 0, 1, 3])
  })
})

describe('pièce d\'identité', () => {
  const cni = idTypeOf('cni')!
  const passeport = idTypeOf('passeport')!
  it('propose quatre pièces, recto/verso sauf le passeport', () => {
    expect(ID_TYPES.map(t => t.key)).toEqual(['cni', 'passeport', 'permis', 'sejour'])
    expect(passeport.sides).toEqual(['photo'])
    expect(cni.sides).toEqual(['recto', 'verso'])
  })
  it('demande les faces manquantes ; un PDF vaut le document entier', () => {
    expect(missingSides(cni, {})).toEqual(['recto', 'verso'])
    expect(missingSides(cni, { recto: { type: 'image/jpeg' } })).toEqual(['verso'])
    expect(missingSides(cni, { recto: { type: 'application/pdf' } })).toEqual([])
    expect(missingSides(passeport, { photo: { type: 'image/png' } })).toEqual([])
  })
  it('bloque « Suivant » tant qu\'il manque une face, sauf si la pièce déposée est gardée', () => {
    expect(blockReason('piece', base)).toContain('Choisissez')
    expect(blockReason('photos', { ...base, idType: 'cni', missingSides: ['verso'] })).toBe('Ajoutez encore : verso.')
    expect(blockReason('photos', { ...base, idType: 'cni', missingSides: [] })).toBeNull()
    expect(blockReason('photos', { ...base, idCardOnFile: true, keepExistingCard: true })).toBeNull()
  })
  it('assemble recto et verso à la même largeur, sous la hauteur maximale', () => {
    const l = stackLayout({ w: 4000, h: 2500 }, { w: 3000, h: 1900 })
    expect(l.a.w).toBe(l.b.w)
    expect(l.a.w).toBeLessThanOrEqual(1600)
    expect(l.b.y).toBeGreaterThan(l.a.y + l.a.h)
    const tall = stackLayout({ w: 1000, h: 3000 }, { w: 1000, h: 3000 })
    expect(tall.height).toBeLessThanOrEqual(2800 + 1)
  })
})

describe('justificatifs et coordonnées', () => {
  it('propose des documents adaptés à chaque profil, un recommandé', () => {
    expect(ROLE_DOCS.bailleur.map(d => d.type)).toContain('title_deed')
    expect(ROLE_DOCS.artisan.find(d => d.recommended)?.type).toBe('artisan_insurance')
    for (const docs of Object.values(ROLE_DOCS)) expect(docs.filter(d => d.recommended)).toHaveLength(1)
    expect(blockReason('documents', { ...base, docCount: 0 })).toContain('au moins un')
    expect(blockReason('documents', { ...base, docCount: 2 })).toBeNull()
  })
  it('exige le nom (sauf déjà enregistré) et valide IFU / RCCM pour un bailleur', () => {
    const f = { fullName: '', company: '', ifu: '', rccm: '' }
    expect(coordErrors(f, { business: false, nameSaved: false }).fullName).toBeTruthy()
    expect(coordErrors(f, { business: false, nameSaved: true })).toEqual({})
    expect(coordErrors({ ...f, fullName: 'Koffi Dossou', ifu: '123' }, { business: true, nameSaved: false }).ifu).toContain('13 chiffres')
    expect(coordErrors({ ...f, fullName: 'Koffi Dossou', rccm: 'RB/COT/25 A 1234' }, { business: true, nameSaved: false })).toEqual({})
  })
  it('résume l\'avancement', () => {
    expect(checklist({ idCardOnFile: true, docCount: 1, nameSaved: false }).map(c => [c.label, c.done, c.detail])).toEqual([
      ["Pièce d'identité", true, 'Déposée'], ['Justificatifs', true, '1 document déposé'], ['Coordonnées', false, 'À compléter']
    ])
  })
})
