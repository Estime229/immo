import { describe, expect, it } from 'vitest'
import { buildSearchQuery, digitsOnly, draftFromQuery, summarizeSearch } from '../app/utils/searchPill'

describe('digitsOnly', () => {
  it('ne garde que les chiffres, sans zéros de tête', () => {
    expect(digitsOnly('150 000 F')).toBe('150000')
    expect(digitsOnly('00120')).toBe('120')
    expect(digitsOnly('abc')).toBe('')
  })
})

describe('buildSearchQuery', () => {
  it('omet les critères vides et le mode « tous »', () => {
    expect(buildSearchQuery({ q: '  ', city: '', budget: '', mode: 'tous' })).toEqual({})
  })

  it('produit les paramètres lus par /recherche', () => {
    expect(buildSearchQuery({ q: ' studio ', city: 'Cotonou', budget: '150 000', mode: 'mois' }))
      .toEqual({ q: 'studio', city: 'Cotonou', budget: '150000', mode: 'mois' })
  })

  it('ignore un budget nul', () => {
    expect(buildSearchQuery({ q: '', city: '', budget: '0', mode: 'tous' })).toEqual({})
  })
})

describe('draftFromQuery', () => {
  it("relit l'URL de /recherche, en rejetant un mode inconnu", () => {
    expect(draftFromQuery({ q: 'villa', city: 'Calavi', budget: '90000', mode: 'semaine' }))
      .toEqual({ q: 'villa', city: 'Calavi', budget: '90000', mode: 'tous' })
    expect(draftFromQuery({ mode: ['nuit', 'mois'] }).mode).toBe('nuit')
  })
})

describe('summarizeSearch', () => {
  it("invite à chercher quand il n'y a aucun critère", () => {
    expect(summarizeSearch(null).title).toBe('Où cherchez-vous ?')
    expect(summarizeSearch({ q: '', city: '', budget: '', mode: 'tous' }).title).toBe('Où cherchez-vous ?')
  })

  it('résume la recherche en cours', () => {
    const s = summarizeSearch({ q: '', city: 'Cotonou', budget: '150000', mode: 'mois' })
    expect(s.title).toBe('Cotonou')
    expect(s.subtitle).toBe('≤ 150 000 F · Au mois')
  })

  it('reste lisible avec seulement un mode ou un texte libre', () => {
    expect(summarizeSearch({ q: '', city: '', budget: '', mode: 'nuit' })).toEqual({ title: 'Tous les logements', subtitle: 'À la nuit' })
    expect(summarizeSearch({ q: 'studio', city: '', budget: '', mode: 'tous' })).toEqual({ title: 'studio', subtitle: 'Tous les budgets' })
  })
})
