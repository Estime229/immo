/** Référentiels publics — voir 10-SOCLE-INTEGRATION.md (mise en cache des référentiels) et I4. */

export interface RefEntry {
  id: string
  type: string
  code: string
  labels: Record<string, string>
  description: string | null
  metadata: Record<string, unknown> | null
  parent_id: string | null
  sort_order: number
  is_system: boolean
  is_active: boolean
  children: RefEntry[]
}

export interface City {
  id: string
  name: string
  country_id: string
}

export interface Neighborhood {
  id: string
  name: string
  city_id: string
}
