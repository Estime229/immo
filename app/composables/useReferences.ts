export interface ReferenceItem {
  id: string
  type: string
  code: string
  labels: Record<string, string>
  description?: string | null
  parent_id?: string | null
  sort_order?: number
  metadata?: Record<string, unknown> | null
  color?: string
  icon_lucide?: string
  is_system: boolean
  is_active?: boolean
  created_at?: string
  updated_at?: string
}

export interface ReferenceInput {
  type: string
  code: string
  labels: { fr: string; en: string }
}

export interface ReferenceUpdateInput {
  labels?: { fr: string; en: string }
  sort_order?: number
  is_active?: boolean
}

interface RawRefCategoryItem {
  id: string
  code: string
  labels: Record<string, string>
  is_system: boolean
  sort_order?: number
  metadata?: Record<string, unknown> | null
  color?: string
  icon_lucide?: string
}

interface RawRefResponse {
  propertyTypes: RawRefCategoryItem[]
  propertyStatuses: RawRefCategoryItem[]
  unitTypes: RawRefCategoryItem[]
  unitFeatures: RawRefCategoryItem[]
}

// GET /ref renvoie un objet groupé par catégorie (pas un tableau plat, ni de champ `type`
// par item) — vérifié en live. Le vrai champ `type` n'apparaît que sur `GET /ref?type=…`
// et la vue détail ; on le reconstitue ici depuis la clé de regroupement. Les équipements
// sont de type FEATURE (`GET /ref?type=UNIT_FEATURE` est vide, vérifié en live).
const REF_CATEGORY_TYPE: Record<keyof RawRefResponse, string> = {
  propertyTypes: 'PROPERTY_TYPE',
  propertyStatuses: 'PROPERTY_STATUS',
  unitTypes: 'UNIT_TYPE',
  unitFeatures: 'FEATURE'
}

/** Code technique proposé à partir du libellé : « Château d'eau » → `chateau_d_eau`. */
export function referenceCodeFrom(label: string): string {
  return label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60)
}

/** Minuscules, chiffres et `_` entre deux mots — la forme des codes existants (`2_chambres_salon`). */
export function isValidReferenceCode(code: string): boolean {
  return /^[a-z0-9]+(?:_[a-z0-9]+)*$/.test(code)
}

export function useReferences() {
  const { apiFetch } = useApi()

  async function fetchReferences(): Promise<ReferenceItem[]> {
    const raw = await apiFetch<RawRefResponse>('/ref')
    return (Object.keys(REF_CATEGORY_TYPE) as Array<keyof RawRefResponse>).flatMap(key =>
      (raw[key] ?? []).map(item => ({ ...item, type: REF_CATEGORY_TYPE[key] }))
    )
  }

  /** Une catégorie complète (tableau, avec `type` et `is_active`), désactivées comprises par défaut. */
  function fetchReferencesByType(type: string, includeInactive = true) {
    return apiFetch<ReferenceItem[]>('/ref', { query: { type, ...(includeInactive ? { include_inactive: 'true' } : {}) } })
  }

  function createReference(data: ReferenceInput) {
    return apiFetch<ReferenceItem>('/ref/admin', { method: 'POST', body: data })
  }

  function updateReference(id: string, data: ReferenceUpdateInput) {
    return apiFetch<ReferenceItem>(`/ref/admin/${id}`, { method: 'PATCH', body: data })
  }

  /** Désactivation (suppression douce côté API) : la référence reste lisible avec `include_inactive`. */
  function deleteReference(id: string) {
    return apiFetch(`/ref/admin/${id}`, { method: 'DELETE' })
  }

  return { fetchReferences, fetchReferencesByType, createReference, updateReference, deleteReference }
}
