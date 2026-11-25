import { describe, expect, it } from 'vitest'
import { APPROX_AREA_RADIUS_M, approximateArea, cityCenter, poiDistanceBand, distanceKm, focusCluster, formatCoords, preciseLocation, rankCities, resolveLocation, roundCoords } from '../app/utils/geo'

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

describe('rankCities', () => {
  const cities = ['Abomey', 'Adjarra', 'Cotonou', 'Kandi', 'Porto-Novo', 'Sèmè-Podji'].map(name => ({ name }))
  it('villes avec annonces d\'abord, puis grandes villes, puis alphabet', () => {
    expect(rankCities(cities, ['Kandi', 'Porto-Novo', 'Kandi']).map(c => c.name)).toEqual(['Kandi', 'Porto-Novo', 'Cotonou', 'Sèmè-Podji', 'Abomey', 'Adjarra'])
  })
  it('compare sans accents ni casse', () => {
    expect(rankCities(cities, ['SEME PODJI'])[0]!.name).toBe('Sèmè-Podji')
  })
})

describe('approximateArea', () => {
  it('est déterministe', () => {
    const p = { lat: 6.3632, lng: 2.4185 }
    expect(approximateArea(p)).toEqual(approximateArea(p))
    expect(approximateArea({ ...p })).toEqual(approximateArea(p))
  })

  it('renvoie le centre de la maille de 0,005° qui contient le point', () => {
    expect(approximateArea({ lat: 6.3632, lng: 2.4185 })).toEqual({ lat: 6.3625, lng: 2.4175 })
  })

  it('donne le même résultat pour deux points de la même maille', () => {
    const a = approximateArea({ lat: 6.3601, lng: 2.4101 })
    const b = approximateArea({ lat: 6.3649, lng: 2.4149 })
    expect(a).toEqual(b)
  })

  it('donne des résultats différents pour des mailles voisines', () => {
    const a = approximateArea({ lat: 6.3649, lng: 2.4125 })
    const nord = approximateArea({ lat: 6.3651, lng: 2.4125 })
    const est = approximateArea({ lat: 6.3649, lng: 2.4151 })
    expect(nord).not.toEqual(a)
    expect(nord.lng).toBe(a.lng)
    expect(est).not.toEqual(a)
    expect(est.lat).toBe(a.lat)
  })

  it('reste à moins de APPROX_AREA_RADIUS_M du point réel sur un échantillon du Bénin', () => {
    const points: { lat: number, lng: number }[] = [
      { lat: 6.35, lng: 2.355 },
      { lat: 6.4527400, lng: 2.3551900 },
      { lat: 6.2, lng: 0.7 },
      { lat: 12.5, lng: 3.9 },
      { lat: 9.3372, lng: 2.6303 },
      { lat: 6.4, lng: 2.4 },
      { lat: 10.0, lng: 1.0 }
    ]
    for (let lat = 6.2; lat <= 12.5; lat += 0.317) {
      for (let lng = 0.7; lng <= 3.9; lng += 0.289) points.push({ lat, lng })
    }
    for (const p of points) {
      const d = distanceKm(p, approximateArea(p))
      expect(d, `${p.lat},${p.lng}`).toBeLessThan(APPROX_AREA_RADIUS_M / 1000)
    }
  })

  it('traite de la même façon les coordonnées négatives (hémisphère sud / ouest)', () => {
    expect(approximateArea({ lat: -6.3632, lng: -2.4185 })).toEqual({ lat: -6.3625, lng: -2.4175 })
    const a = approximateArea({ lat: -6.3601, lng: -2.4101 })
    expect(approximateArea({ lat: -6.3649, lng: -2.4149 })).toEqual(a)
    for (const p of [{ lat: -6.35, lng: -2.355 }, { lat: -0.001, lng: -0.001 }, { lat: -33.8688, lng: -70.1234 }]) {
      expect(distanceKm(p, approximateArea(p))).toBeLessThan(APPROX_AREA_RADIUS_M / 1000)
    }
  })
})

describe('poiDistanceBand — distances publiques par tranches', () => {
  it('ne donne jamais la distance au mètre', () => {
    expect(poiDistanceBand(50)).toBe('à moins de 500 m')
    expect(poiDistanceBand(500)).toBe('à moins de 500 m')
    expect(poiDistanceBand(501)).toBe('entre 500 m et 1 km')
    expect(poiDistanceBand(1000)).toBe('entre 500 m et 1 km')
    expect(poiDistanceBand(2400)).toBe('à plus de 1 km')
  })

  it("n'affiche rien pour une distance absente ou invalide", () => {
    expect(poiDistanceBand(null)).toBe('')
    expect(poiDistanceBand(undefined)).toBe('')
    expect(poiDistanceBand(Number.NaN)).toBe('')
    expect(poiDistanceBand(-5)).toBe('')
  })
})
