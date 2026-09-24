import type { PropertySearchResult, UnitSearchResult } from '~/types/property'

/**
 * `GET /property/search` mélange deux formes dans `data[]` : des biens avec
 * leurs unités (`units[]`), et des unités "standalone" sans bien parent
 * (`_virtual: true`, vérifié en direct — pas seulement documenté). Une carte
 * de résultat, c'est une unité : ce module aplatit les deux formes en une
 * liste uniforme, une entrée par unité louable.
 */
export interface ListingCard {
  unitId: string
  propertyId: string | null
  title: string
  cityName: string
  neighborhoodName: string
  price: number
  bedrooms: number
  surface: number | null
  photoUrl: string | null
  /** Toutes les photos disponibles (bien + unité), primaire en premier — alimente le carrousel de la carte. */
  photoUrls: string[]
  status: UnitSearchResult['unit_status']
  availableFrom: string | null
  /** Une unité standalone n'a pas de fiche `/biens/:id` dans ce lot — voir INTEGRATION-TESTS.md. */
  virtual: boolean
}

function isVirtualUnit(item: PropertySearchResult | UnitSearchResult): item is UnitSearchResult {
  return '_virtual' in item && item._virtual === true
}

function mediaUrls(media: { url: string; is_primary?: boolean; rank?: number }[] | undefined): string[] {
  if (!media?.length) return []
  const sorted = [...media].sort((a, b) => {
    const primaryDiff = Number(!!b.is_primary) - Number(!!a.is_primary)
    return primaryDiff !== 0 ? primaryDiff : (a.rank ?? 0) - (b.rank ?? 0)
  })
  return [...new Set(sorted.map(m => m.url))]
}

export function flattenSearchResults(items: (PropertySearchResult | UnitSearchResult)[]): ListingCard[] {
  const out: ListingCard[] = []

  for (const item of items) {
    if (isVirtualUnit(item)) {
      const photos = mediaUrls(item.unit_media)
      out.push({
        unitId: item.id,
        propertyId: null,
        title: item.name,
        cityName: item.city?.name ?? '',
        neighborhoodName: '',
        price: Number(item.price),
        bedrooms: item.bedrooms_count ?? 0,
        surface: item.surface_m2,
        photoUrl: photos[0] ?? null,
        photoUrls: photos,
        status: item.unit_status,
        availableFrom: item.available_from,
        virtual: true
      })
      continue
    }

    const property = item
    for (const u of property.units ?? []) {
      const photos = [...new Set([...mediaUrls(property.media), ...mediaUrls(u.unit_media)])]
      out.push({
        unitId: u.id,
        propertyId: property.id,
        title: u.name,
        cityName: property.city?.name ?? '',
        neighborhoodName: property.neighborhood?.name ?? '',
        price: Number(u.price),
        bedrooms: u.bedrooms_count ?? 0,
        surface: u.surface_m2,
        photoUrl: photos[0] ?? null,
        photoUrls: photos,
        status: u.unit_status,
        availableFrom: u.available_from,
        virtual: false
      })
    }
  }

  return out
}
