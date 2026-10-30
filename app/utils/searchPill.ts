/**
 * Barre de recherche de l'en-tête mobile : construction de l'URL de
 * `/recherche` et résumé affiché dans la pilule — logique pure, testée dans
 * tests/searchPill.test.ts.
 */

export type SearchRentalMode = 'tous' | 'nuit' | 'mois'

export interface SearchDraft {
  q: string
  city: string
  budget: string
  mode: SearchRentalMode
}

type QueryValue = string | null | undefined | (string | null)[]

function first(v: QueryValue): string {
  return String((Array.isArray(v) ? v[0] : v) ?? '').trim()
}

/** Seuls les chiffres comptent (« 150 000 F » → 150000) ; `/recherche` fait `Number(budget)`. */
export function digitsOnly(value: string): string {
  return value.replace(/\D/g, '').replace(/^0+(?=\d)/, '')
}

/** Mêmes paramètres que ceux lus par `/recherche` (q, city, budget, mode) — les vides sont omis. */
export function buildSearchQuery(d: SearchDraft): Record<string, string> {
  const out: Record<string, string> = {}
  if (d.q.trim()) out.q = d.q.trim()
  if (d.city) out.city = d.city
  const budget = digitsOnly(d.budget)
  if (budget && budget !== '0') out.budget = budget
  if (d.mode !== 'tous') out.mode = d.mode
  return out
}

export function draftFromQuery(query: Record<string, QueryValue>): SearchDraft {
  const mode = first(query.mode)
  return {
    q: first(query.q),
    city: first(query.city),
    budget: digitsOnly(first(query.budget)),
    mode: mode === 'nuit' || mode === 'mois' ? mode : 'tous'
  }
}

const MODE_LABEL: Record<SearchRentalMode, string> = { tous: '', nuit: 'À la nuit', mois: 'Au mois' }

function formatBudget(digits: string): string {
  return `≤ ${Number(digits).toLocaleString('fr-FR').replace(/ | /g, ' ')} F`
}

/**
 * Texte de la pilule : l'invitation par défaut, ou la recherche en cours quand
 * on est sur `/recherche` — la pilule sert alors aussi de rappel des critères.
 */
export function summarizeSearch(d: SearchDraft | null): { title: string; subtitle: string } {
  const empty = { title: 'Où cherchez-vous ?', subtitle: 'Ville · Budget · À la nuit ou au mois' }
  if (!d) return empty
  const title = [d.city, d.q].filter(Boolean).join(' · ')
  const details = [d.budget ? formatBudget(d.budget) : '', MODE_LABEL[d.mode]].filter(Boolean)
  if (!title && !details.length) return empty
  return {
    title: title || 'Tous les logements',
    subtitle: details.join(' · ') || 'Tous les budgets'
  }
}

/* ---- État complet de /recherche dans l'URL ----
 * Avant, seul `mode` y vivait : tri, quartier, chambres, eau, compteur et type
 * étaient perdus au rechargement, au partage et au retour depuis une fiche. */

export type SearchSort = 'newest' | 'oldest' | 'price_asc' | 'price_desc'
export type SearchView = 'liste' | 'carte'

export interface SearchFiltersState {
  q: string
  city: string
  neighborhood: string
  bedrooms: string
  water: string
  meter: string
  budget: string
  sort: SearchSort
  unitType: string
  mode: SearchRentalMode
  view: SearchView
}

const SORTS: SearchSort[] = ['newest', 'oldest', 'price_asc', 'price_desc']

/** Noms des paramètres d'URL — `q`, `city`, `budget`, `mode`, `unit_type_id` sont déjà utilisés par l'accueil. */
export const SEARCH_QUERY_KEYS = ['q', 'city', 'neighborhood', 'bedrooms', 'water', 'meter', 'budget', 'sort', 'unit_type_id', 'mode', 'view'] as const

export const EMPTY_SEARCH: SearchFiltersState = { q: '', city: '', neighborhood: '', bedrooms: '', water: '', meter: '', budget: '', sort: 'newest', unitType: '', mode: 'tous', view: 'liste' }

/** Lit l'URL de /recherche ; un budget saisi en texte (« 100 000 F ») est ramené à ses chiffres, une valeur inconnue au défaut. */
export function filtersFromQuery(query: Record<string, QueryValue>): SearchFiltersState {
  const sort = first(query.sort) as SearchSort
  const draft = draftFromQuery(query)
  const budget = draft.budget === '0' ? '' : draft.budget
  return {
    q: draft.q,
    city: draft.city,
    neighborhood: first(query.neighborhood),
    bedrooms: digitsOnly(first(query.bedrooms)).slice(0, 2),
    water: first(query.water),
    meter: first(query.meter),
    budget,
    sort: SORTS.includes(sort) ? sort : 'newest',
    unitType: first(query.unit_type_id),
    mode: draft.mode,
    view: first(query.view) === 'carte' ? 'carte' : 'liste'
  }
}

/** Inverse de `filtersFromQuery` : les valeurs par défaut sont omises, pour une URL courte. */
export function filtersToQuery(f: SearchFiltersState): Record<string, string> {
  const out: Record<string, string> = {}
  if (f.q.trim()) out.q = f.q.trim()
  if (f.city) out.city = f.city
  if (f.city && f.neighborhood) out.neighborhood = f.neighborhood
  if (f.bedrooms) out.bedrooms = f.bedrooms
  if (f.water) out.water = f.water
  if (f.meter) out.meter = f.meter
  const budget = digitsOnly(f.budget)
  if (budget && budget !== '0') out.budget = budget
  if (f.sort !== 'newest') out.sort = f.sort
  if (f.unitType) out.unit_type_id = f.unitType
  if (f.mode !== 'tous') out.mode = f.mode
  if (f.view !== 'liste') out.view = f.view
  return out
}

/** Mêmes critères de recherche (la vue liste/carte n'en est pas un). */
export function sameSearch(a: SearchFiltersState, b: SearchFiltersState): boolean {
  const qa = filtersToQuery({ ...a, view: 'liste' })
  const qb = filtersToQuery({ ...b, view: 'liste' })
  const keys = new Set([...Object.keys(qa), ...Object.keys(qb)])
  return [...keys].every(k => qa[k] === qb[k])
}

/**
 * Pilule de l'en-tête soumise depuis /recherche : elle ne connaît que q, ville,
 * budget et mode — les autres critères affichés (chambres, eau, tri…) sont
 * gardés. Le quartier tombe si la ville change (il appartient à l'ancienne).
 */
export function mergeSearchQuery(current: Record<string, QueryValue>, d: SearchDraft): Record<string, string> {
  const kept = filtersFromQuery(current)
  const pill = buildSearchQuery(d)
  return filtersToQuery({
    ...kept,
    q: pill.q ?? '',
    city: pill.city ?? '',
    neighborhood: (pill.city ?? '') === kept.city ? kept.neighborhood : '',
    budget: pill.budget ?? '',
    mode: d.mode
  })
}

/** Chemin complet d'une recherche (`/recherche?city=…`), pour la mémoriser. */
export function searchPath(query: Record<string, string>): string {
  const qs = new URLSearchParams(query).toString()
  return qs ? `/recherche?${qs}` : '/recherche'
}

/* ---- Dernière recherche, pour « ← Résultats » de la fiche ----
 * sessionStorage : survit au rechargement de la fiche, propre à l'onglet.
 * Accès protégé : navigation privée ou stockage bloqué → simple repli sur /recherche. */
const LAST_SEARCH_KEY = 'immo:last-search'

export function rememberSearch(path: string) {
  try {
    sessionStorage.setItem(LAST_SEARCH_KEY, path)
  } catch {
    // Stockage indisponible : le retour mènera à une recherche vierge.
  }
}

export function recallSearch(): string {
  try {
    const path = sessionStorage.getItem(LAST_SEARCH_KEY)
    return path && path.startsWith('/recherche') ? path : '/recherche'
  } catch {
    return '/recherche'
  }
}
