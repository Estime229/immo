import { describe, expect, it } from 'vitest'
import { avatarPaletteIndex } from '../app/utils/avatar'

describe('avatarPaletteIndex', () => {
  it('est stable pour un même nom', () => {
    expect(avatarPaletteIndex('Awa Koffi', 8)).toBe(avatarPaletteIndex('Awa Koffi', 8))
  })

  it('reste borné à [0, paletteSize - 1]', () => {
    const noms = ['Awa', 'Koffi Mensah', 'a', 'ZZZZZZZZZZ', 'Éloïse', '😀', 'x'.repeat(500)]
    for (const size of [1, 2, 5, 8, 13]) {
      for (const nom of noms) {
        const i = avatarPaletteIndex(nom, size)
        expect(Number.isInteger(i)).toBe(true)
        expect(i).toBeGreaterThanOrEqual(0)
        expect(i).toBeLessThanOrEqual(size - 1)
      }
    }
  })

  it('renvoie 0 pour un nom vide', () => {
    expect(avatarPaletteIndex('', 8)).toBe(0)
  })

  it('renvoie 0 quand la palette est vide ou négative', () => {
    expect(avatarPaletteIndex('Awa', 0)).toBe(0)
    expect(avatarPaletteIndex('Awa', -3)).toBe(0)
  })

  it('accepte les accents et les emoji', () => {
    expect(() => avatarPaletteIndex('Éloïse Ñandú', 6)).not.toThrow()
    expect(() => avatarPaletteIndex('Awa 😀👨‍👩‍👧', 6)).not.toThrow()
    expect(avatarPaletteIndex('😀', 1000)).toBe(0x1F600 % 1000)
  })

  it('répartit des noms différents sur plusieurs indices', () => {
    const noms = ['Awa', 'Koffi', 'Mensah', 'Adjovi', 'Sènami', 'Yao', 'Codjo', 'Fatou', 'Ibrahim', 'Rose']
    const indices = new Set(noms.map(n => avatarPaletteIndex(n, 8)))
    expect(indices.size).toBeGreaterThan(1)
  })
})
