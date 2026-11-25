import { describe, expect, it } from 'vitest'
import { groupFeatures, hasFeatureCategories, OTHER_FEATURE_CATEGORY, type FeatureRefEntry } from '../app/utils/featureGroups'

const ref = (code: string, fr: string, category?: unknown, extra: Partial<FeatureRefEntry> = {}): FeatureRefEntry => ({
  code,
  labels: { fr },
  metadata: category === undefined ? null : { category_code: category },
  ...extra
})

const refs: FeatureRefEntry[] = [
  ref('wifi', 'Wi-Fi', 'ESSENTIAL'),
  ref('eau', 'Eau courante', 'ESSENTIAL'),
  ref('clim', 'Climatisation', 'COMFORT'),
  ref('gardien', 'Gardien', 'SECURITY'),
  ref('jardin', 'Jardin', 'EXTERIOR')
]

describe('groupFeatures', () => {
  it('range les équipements par catégorie dans l\'ordre Essentiel, Confort, Sécurité, Extérieur', () => {
    const groups = groupFeatures(['jardin', 'gardien', 'clim', 'wifi'], refs)
    expect(groups.map(g => g.key)).toEqual(['ESSENTIAL', 'COMFORT', 'SECURITY', 'EXTERIOR'])
    expect(groups.map(g => g.label)).toEqual(['Essentiel', 'Confort', 'Sécurité', 'Extérieur'])
    expect(groups[0]!.items).toEqual([{ code: 'wifi', label: 'Wi-Fi' }])
  })

  it('renvoie une liste vide pour aucun code', () => {
    expect(groupFeatures([], refs)).toEqual([])
    expect(groupFeatures([], [])).toEqual([])
  })

  it('ignore les codes vides et dédoublonne', () => {
    const groups = groupFeatures(['wifi', 'wifi', '', 'wifi'], refs)
    expect(groups).toHaveLength(1)
    expect(groups[0]!.items).toEqual([{ code: 'wifi', label: 'Wi-Fi' }])
  })

  it('lit la catégorie dans metadata.category_code, puis metadata.category, puis category', () => {
    const r: FeatureRefEntry[] = [
      { code: 'a', labels: { fr: 'A' }, metadata: { category_code: 'SECURITY', category: 'COMFORT' }, category: 'EXTERIOR' },
      { code: 'b', labels: { fr: 'B' }, metadata: { category: 'COMFORT' }, category: 'EXTERIOR' },
      { code: 'c', labels: { fr: 'C' }, category: 'EXTERIOR' }
    ]
    const keys = Object.fromEntries(groupFeatures(['a', 'b', 'c'], r).map(g => [g.key, g.items[0]!.code]))
    expect(keys).toEqual({ SECURITY: 'a', COMFORT: 'b', EXTERIOR: 'c' })
  })

  it('ignore la casse et les espaces de la catégorie', () => {
    const r = [ref('a', 'A', 'comfort'), ref('b', 'B', '  Comfort ')]
    const groups = groupFeatures(['a', 'b'], r)
    expect(groups).toHaveLength(1)
    expect(groups[0]!.key).toBe('COMFORT')
    expect(groups[0]!.items.map(i => i.code)).toEqual(['a', 'b'])
  })

  it('range en « Autres » une catégorie inconnue, vide ou non textuelle, et un code absent du référentiel', () => {
    const r = [ref('a', 'A', 'MYSTERE'), ref('b', 'B', ''), ref('c', 'C', 42), ref('d', 'D')]
    const groups = groupFeatures(['a', 'b', 'c', 'd', 'inconnu'], r)
    expect(groups).toHaveLength(1)
    expect(groups[0]!.key).toBe(OTHER_FEATURE_CATEGORY)
    expect(groups[0]!.label).toBe('Autres')
    expect(groups[0]!.items).toHaveLength(5)
  })

  it('place « Autres » en dernier', () => {
    const groups = groupFeatures(['inconnu', 'jardin', 'wifi'], refs)
    expect(groups.map(g => g.key)).toEqual(['ESSENTIAL', 'EXTERIOR', OTHER_FEATURE_CATEGORY])
  })

  it('nomme une catégorie inconnue grâce aux libellés fournis, après les catégories connues', () => {
    const r = [ref('piscine', 'Piscine', 'LEISURE'), ref('wifi', 'Wi-Fi', 'ESSENTIAL'), ref('x', 'X')]
    const groups = groupFeatures(['x', 'piscine', 'wifi'], r, { LEISURE: 'Loisirs' })
    expect(groups.map(g => g.key)).toEqual(['ESSENTIAL', 'LEISURE', OTHER_FEATURE_CATEGORY])
    expect(groups[1]!.label).toBe('Loisirs')
  })

  it('met en « Autres » une catégorie sans libellé fourni ni connu', () => {
    const groups = groupFeatures(['piscine'], [ref('piscine', 'Piscine', 'LEISURE')], { AUTRE: 'Autre' })
    expect(groups.map(g => g.key)).toEqual([OTHER_FEATURE_CATEGORY])
  })

  it('donne la priorité aux libellés fournis sur les libellés connus, quelle que soit leur casse', () => {
    const groups = groupFeatures(['clim'], refs, { comfort: 'Bien-être' })
    expect(groups[0]!.key).toBe('COMFORT')
    expect(groups[0]!.label).toBe('Bien-être')
  })

  it('trie les catégories supplémentaires par libellé', () => {
    const r = [ref('a', 'A', 'ZEN'), ref('b', 'B', 'ART')]
    const groups = groupFeatures(['a', 'b'], r, { ZEN: 'Zen', ART: 'Art' })
    expect(groups.map(g => g.label)).toEqual(['Art', 'Zen'])
  })

  it('trie les équipements par sort_order puis par libellé', () => {
    const r = [
      ref('c', 'Cuisine', 'COMFORT', { sort_order: 2 }),
      ref('a', 'Balcon', 'COMFORT', { sort_order: 1 }),
      ref('b', 'Armoire', 'COMFORT', { sort_order: 2 }),
      ref('z', 'Zèbre', 'COMFORT')
    ]
    const items = groupFeatures(['z', 'c', 'b', 'a'], r)[0]!.items
    expect(items.map(i => i.code)).toEqual(['a', 'b', 'c', 'z'])
  })

  it('utilise le libellé anglais à défaut du français', () => {
    const r: FeatureRefEntry[] = [{ code: 'pool', labels: { en: 'Pool' }, metadata: { category_code: 'COMFORT' } }]
    expect(groupFeatures(['pool'], r)[0]!.items).toEqual([{ code: 'pool', label: 'Pool' }])
  })

  it('génère un libellé lisible pour un code absent du référentiel', () => {
    const items = groupFeatures(['cuisine_interne', 'eau-chaude'], [])[0]!.items
    expect(items.map(i => i.label).sort()).toEqual(['Cuisine interne', 'Eau chaude'])
    expect(items.every(i => !i.label.includes('_'))).toBe(true)
  })
})

describe('hasFeatureCategories', () => {
  it('est faux pour aucun groupe', () => {
    expect(hasFeatureCategories([])).toBe(false)
  })

  it('est faux quand il n\'y a que « Autres »', () => {
    expect(hasFeatureCategories(groupFeatures(['x', 'y'], []))).toBe(false)
  })

  it('est vrai dès qu\'une catégorie connue est présente', () => {
    expect(hasFeatureCategories(groupFeatures(['wifi', 'x'], refs))).toBe(true)
  })
})
