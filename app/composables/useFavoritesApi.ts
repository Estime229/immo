import type { PropertySearchResult } from '~/types/property'

export interface FavoriteIds {
  property_ids: string[]
  unit_ids: string[]
}

/** `property`/`unit` : l'un des deux est peuplé selon ce qui a été mis en favori — jamais les deux. */
export interface FavoriteEntry {
  id: string
  property_id: string | null
  unit_id: string | null
  created_at: string
  property: PropertySearchResult | null
  unit: unknown | null
}

/** Favoris — authentifié (voir Swagger : `security: bearer`), contrairement au reste de la recherche/fiche publique. */
export function useFavoritesApi() {
  const api = useApi()

  async function fetchIds() {
    return api.get<FavoriteIds>('/property/favorites/ids')
  }

  /** Détails complets (photos, ville, prix) — vérifié en direct : `property` est un objet complet, pas le résumé montré par l'exemple Swagger. */
  async function fetchMine() {
    return api.get<FavoriteEntry[]>('/property/favorites/my')
  }

  /** Réponse réelle `{ favorited: boolean }` — vérifié en direct, diffère de l'exemple Swagger (`{ action, favorite_id }`). */
  async function toggle(target: { propertyId?: string; unitId?: string }) {
    return api.post<{ favorited: boolean }>('/property/favorites/toggle', {
      property_id: target.propertyId,
      unit_id: target.unitId
    })
  }

  return { fetchIds, fetchMine, toggle }
}

/**
 * État réactif des favoris pour les cartes/fiches — même principe que le
 * verrou de rafraîchissement : un seul chargement partagé par session. Un
 * visiteur non connecté a toujours `isFavorite() === false` et `toggle()`
 * n'appelle jamais l'API (redirige l'appelant vers la connexion à la place).
 */
export function usePropertyFavorites() {
  const favoritesApi = useFavoritesApi()
  const { isAuthenticated } = useApiAuth()
  const ids = useState<FavoriteIds>('propertyFavoriteIds', () => ({ property_ids: [], unit_ids: [] }))
  const loaded = useState('propertyFavoritesLoaded', () => false)

  async function ensureLoaded() {
    if (loaded.value || !isAuthenticated()) return
    loaded.value = true
    try {
      ids.value = await favoritesApi.fetchIds()
    } catch {
      loaded.value = false
    }
  }

  function isFavoriteProperty(id: string) {
    return ids.value.property_ids.includes(id)
  }
  function isFavoriteUnit(id: string) {
    return ids.value.unit_ids.includes(id)
  }

  async function toggleProperty(id: string) {
    if (!isAuthenticated()) return false
    const was = isFavoriteProperty(id)
    ids.value = was
      ? { ...ids.value, property_ids: ids.value.property_ids.filter(x => x !== id) }
      : { ...ids.value, property_ids: [...ids.value.property_ids, id] }
    try {
      await favoritesApi.toggle({ propertyId: id })
      return true
    } catch {
      ids.value = was
        ? { ...ids.value, property_ids: [...ids.value.property_ids, id] }
        : { ...ids.value, property_ids: ids.value.property_ids.filter(x => x !== id) }
      return false
    }
  }

  return { ids, ensureLoaded, isFavoriteProperty, isFavoriteUnit, toggleProperty }
}
