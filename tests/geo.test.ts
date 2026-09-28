import { describe, expect, it } from 'vitest'
import { cityCenter, distanceKm, focusCluster, formatCoords, preciseLocation, resolveLocation, roundCoords } from '../app/utils/geo'

describe('preciseLocation', () => {
  it('accepte un point GPS au Bénin, en chaîne ou en nombre', () => {
    expect(preciseLocation('6.3632000', '2.4185000')).toEqual({ lat: 6.3632, lng: 2.4185 })
    expect(preciseLocation(9.3372, 2.6303)).toEqual({ lat: 9.3372, lng: 2.6303 })
  })

  it('écarte un point absent, illisible ou hors du Bénin', () => {
    expect(preciseLocation(null, null)).toBeNull()
    expect(preciseLocation('', '2.4')).toBeNull()
    expect(preciseLocation('abc', '2.4')).toBeNull()
    // Cas réel « Studio LAPERTA » : en plein golfe de Guinée.
    expect(preciseLocation('1.0012444', '2.0949334')).toBeNull()
  })
})

describe('resolveLocation', () => {
  it('garde le GPS quand il est valable', () => {
    expect(resolveLocation({ gps_latitude: '6.3718', gps_longitude: '2.4356', city: { name: 'Cotonou' } })).toEqual({ lat: 6.3718, lng: 2.4356, precise: true })
  })

  it('retombe sur le centre de la ville, marqué approximatif', () => {
    const loc = resolveLocation({ gps_latitude: '1.0012444', gps_longitude: '2.0949334', city: { name: 'Parakou' } })
    expect(loc).toMatchObject({ precise: false })
    expect(loc).toMatchObject(cityCenter('Parakou')!)
  })

  it('reconnaît une ville malgré accents, casse et espaces', () => {
    expect(cityCenter('Sèmè-Podji')).not.toBeNull()
    expect(cityCenter(' abomey-calavi ')).not.toBeNull()
  })

  it('renvoie null sans GPS ni ville connue', () => {
    expect(resolveLocation({ gps_latitude: null, gps_longitude: null, city: null })).toBeNull()
    expect(resolveLocation({ city: { name: 'Ville inconnue' } })).toBeNull()
  })
})

describe('focusCluster', () => {
  const cotonou = { lat: 6.3654, lng: 2.4183, weight: 30 }
  const calavi = { lat: 6.4485, lng: 2.3557, weight: 15 }
  const parakou = { lat: 9.3372, lng: 2.6303, weight: 1 }

  it('cadre le secteur le plus fourni et laisse de côté un bien isolé', () => {
    expect(focusCluster([parakou, cotonou, calavi])).toEqual([cotonou, calavi])
  })

  it('garde tout quand les repères sont proches', () => {
    expect(focusCluster([cotonou, calavi])).toEqual([cotonou, calavi])
  })

  it("mesure une distance plausible entre Cotonou et Parakou (~330 km)", () => {
    const d = distanceKm(cotonou, parakou)
    expect(d).toBeGreaterThan(300)
    expect(d).toBeLessThan(360)
  })
})

describe('formatCoords / roundCoords', () => {
  it('arrondit à 5 décimales (≈ 1 m) avant envoi et affichage', () => {
    expect(roundCoords({ lat: 6.365123456, lng: 2.418765432 })).toEqual({ lat: 6.36512, lng: 2.41877 })
    expect(formatCoords({ lat: 6.3601, lng: 2.4102 })).toBe('6.36010, 2.41020')
  })
})
