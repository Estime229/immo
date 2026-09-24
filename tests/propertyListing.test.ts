import { describe, expect, it } from 'vitest'
import { flattenSearchResults } from '~/utils/propertyListing'
import type { PropertySearchResult, UnitSearchResult } from '~/types/property'

const baseUnit: UnitSearchResult = {
  id: 'u1', property_id: 'p1', name: 'F3 Étage 2', price: '75000.00',
  toilet_type: null, water_source: 'reseau_soneb', meter_type: 'individuel', furnished_level: null,
  min_duration_days: null, max_duration_days: null, unit_status: 'available', available_from: null,
  surface_m2: 65, floor: 2, bedrooms_count: 3, bathrooms_count: 2, description: null, unit_media: []
}

const baseProperty: PropertySearchResult = {
  id: 'p1', owner_id: 'o1', name: 'Résidence Étoile', building_type: 'maison_de_ville',
  address: null, neighborhood_id: 'n1', city_id: 'c1', gps_latitude: null, gps_longitude: null,
  description: null, status: 'available', is_publicly_listed: true,
  media: [{ id: 'm1', url: 'https://cdn/prop.webp', type: 'image', is_primary: true }],
  units: [baseUnit],
  city: { id: 'c1', name: 'Cotonou' },
  neighborhood: { id: 'n1', name: 'Fidjrossè' }
}

const virtualUnit: UnitSearchResult = {
  id: 'u9', property_id: '', name: 'Chambre meublée Fidjrossè', price: '35000.00',
  toilet_type: null, water_source: null, meter_type: null, furnished_level: null,
  min_duration_days: null, max_duration_days: null, unit_status: 'notice_given', available_from: '2026-10-01',
  surface_m2: null, floor: null, bedrooms_count: 1, bathrooms_count: 1, description: null, unit_media: [],
  _virtual: true, city: { id: 'c1', name: 'Cotonou' }
}

describe('flattenSearchResults', () => {
  it('crée une carte par unité d\'un bien, avec le nom du quartier et la photo du bien', () => {
    const cards = flattenSearchResults([baseProperty])
    expect(cards).toHaveLength(1)
    expect(cards[0]).toMatchObject({
      unitId: 'u1', propertyId: 'p1', title: 'F3 Étage 2', cityName: 'Cotonou', neighborhoodName: 'Fidjrossè',
      price: 75000, photoUrl: 'https://cdn/prop.webp', virtual: false
    })
  })

  it('éclate un bien à plusieurs unités en autant de cartes', () => {
    const second: UnitSearchResult = { ...baseUnit, id: 'u2', name: 'F2 Étage 1', price: '55000.00' }
    const cards = flattenSearchResults([{ ...baseProperty, units: [baseUnit, second] }])
    expect(cards.map(c => c.unitId)).toEqual(['u1', 'u2'])
  })

  it('traite une unité standalone (_virtual) comme sa propre carte, marquée virtual', () => {
    const cards = flattenSearchResults([virtualUnit])
    expect(cards).toHaveLength(1)
    expect(cards[0]).toMatchObject({ unitId: 'u9', propertyId: null, virtual: true, price: 35000 })
  })

  it('retombe sur la photo de l\'unité si le bien n\'a aucun média', () => {
    const unitWithPhoto: UnitSearchResult = { ...baseUnit, unit_media: [{ id: 'um1', url: 'https://cdn/unit.webp', type: 'image', rank: 1, is_primary: true }] }
    const cards = flattenSearchResults([{ ...baseProperty, media: [], units: [unitWithPhoto] }])
    expect(cards[0]!.photoUrl).toBe('https://cdn/unit.webp')
  })

  it('renvoie un tableau vide sans erreur si un bien n\'a aucune unité', () => {
    expect(flattenSearchResults([{ ...baseProperty, units: [] }])).toEqual([])
  })
})
