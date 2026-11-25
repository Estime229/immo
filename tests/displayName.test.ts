import { describe, expect, it } from 'vitest'
import { displayName } from '../app/utils/displayName'

describe('displayName — noms saisis en capitales', () => {
  it('remet en casse titre un mot entièrement en capitales de 5 lettres ou plus', () => {
    expect(displayName('AKASSATO')).toBe('Akassato')
    expect(displayName('Résidence DOSSOU')).toBe('Résidence Dossou')
    expect(displayName('VILLA')).toBe('Villa')
  })

  it('garde les sigles et codes courts', () => {
    expect(displayName('Appartement F3')).toBe('Appartement F3')
    expect(displayName('Près du CNHU')).toBe('Près du CNHU')
    expect(displayName('BP 125')).toBe('BP 125')
    expect(displayName('APPARTEMENT F3 CNHU')).toBe('Appartement F3 CNHU')
  })

  it('gère les accents', () => {
    expect(displayName('ÉTOILE DU MATIN')).toBe('Étoile du Matin')
    expect(displayName('RÉSIDENCE ÉLÉGANCE')).toBe('Résidence Élégance')
  })

  it('gère les traits d’union et les apostrophes', () => {
    expect(displayName('ABOMEY-CALAVI')).toBe('Abomey-Calavi')
    expect(displayName('SÈMÈ-PODJI')).toBe('Sèmè-Podji')
    expect(displayName("L'ÉTOILE")).toBe("L'Étoile")
    expect(displayName("Villa D'AKPAKPA")).toBe("Villa d'Akpakpa")
  })

  it('met les mots-outils en minuscules dans un nom crié, sauf en tête', () => {
    expect(displayName('VILLA DE LA LAGUNE')).toBe('Villa de la Lagune')
    expect(displayName('LE PALMIER')).toBe('Le Palmier')
    // Aucun mot long en capitales : rien n'indique un nom « crié », on ne touche à rien.
    expect(displayName('CITE DU LAC')).toBe('CITE DU LAC')
  })

  it('ne modifie pas un nom déjà bien écrit ni la ponctuation', () => {
    expect(displayName('Studio meublé à Fidjrossè')).toBe('Studio meublé à Fidjrossè')
    expect(displayName('iPhone')).toBe('iPhone')
    expect(displayName('MAISON (DUPLEX)')).toBe('Maison (Duplex)')
    expect(displayName('2 CHAMBRES  SALON')).toBe('2 Chambres  Salon')
  })

  it('accepte une valeur vide', () => {
    expect(displayName('')).toBe('')
    expect(displayName(null)).toBe('')
    expect(displayName(undefined)).toBe('')
  })
})
