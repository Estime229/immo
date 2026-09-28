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
