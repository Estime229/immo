/**
 * Logique pure de la navigation de l'espace pro (barre latérale, menu mobile,
 * onglets « Locataires ») — isolée ici pour être testée sans monter le layout
 * (voir tests/proNav.test.ts).
 */

export interface ProNavItem {
  key: string
  to: string
  /** Autres pages qui allument cette entrée (ex. « Locataires » sur Visites et Candidatures). */
  alsoActiveOn?: readonly string[]
  /**
   * Rubrique « avancée » (Équipe, Mandats, Artisans) : masquée du menu en V1,
   * réaffichée par `runtimeConfig.public.proAdvanced`. La page reste joignable
   * par son URL (notifications, alertes, lien d'invitation).
   */
  advanced?: boolean
}

export interface ProNavGroupLike<T extends ProNavItem> {
  header: string
  items: readonly T[]
}

/**
 * Valeur du drapeau `proAdvanced`. Nuxt convertit `NUXT_PUBLIC_PRO_ADVANCED=true`
 * en booléen, mais une valeur passée telle quelle (« 1 », « true » en chaîne) ne
 * doit pas réafficher le menu par erreur ni le laisser masqué : on n'accepte que
 * les formes explicites du « oui ».
 */
export function isProAdvanced(raw: unknown): boolean {
  if (typeof raw === 'string') return ['true', '1'].includes(raw.trim().toLowerCase())
  return raw === true || raw === 1
}

/** Menu affiché : sans le drapeau, les rubriques avancées disparaissent, et un groupe vidé perd son intitulé. */
export function visibleNavGroups<T extends ProNavItem>(groups: ReadonlyArray<ProNavGroupLike<T>>, advanced: boolean): Array<{ header: string; items: T[] }> {
  return groups
    .map(g => ({ header: g.header, items: g.items.filter(i => advanced || !i.advanced) }))
    .filter(g => g.items.length > 0)
}

function pathMatches(path: string, prefix: string) {
  return path === prefix || path.startsWith(`${prefix}/`)
}

/**
 * Entrée de menu correspondant à une page. Calculée sur toutes les entrées, y
 * compris celles masquées par le drapeau : `/pro/equipe` garde son titre
 * « Équipe » au lieu de retomber sur « Aperçu ». La racine (`/pro`) n'est
 * jamais un préfixe : sinon toutes les sous-pages seraient « Aperçu ».
 */
export function navKeyForPath<T extends ProNavItem>(items: readonly T[], path: string, root = '/pro', fallback = 'apercu'): string {
  let best: { key: string; length: number } | null = null
  for (const item of items) {
    for (const p of [item.to, ...(item.alsoActiveOn ?? [])]) {
      const ok = p === root ? path === root : pathMatches(path, p)
      if (ok && (!best || p.length > best.length)) best = { key: item.key, length: p.length }
    }
  }
  return best?.key ?? fallback
}

/**
 * Les trois pages réunies sous l'entrée « Locataires », dans l'ordre du
 * parcours : une recherche publiée, puis une visite, puis une candidature.
 * Chacune garde son URL (liens des notifications, des alertes et du guide).
 */
export const TENANT_TABS = [
  { key: 'demandes', to: '/pro/demandes', label: 'Demandes' },
  { key: 'visites', to: '/pro/visites', label: 'Visites' },
  { key: 'candidatures', to: '/pro/candidatures', label: 'Candidatures' }
] as const

export type TenantTabKey = typeof TENANT_TABS[number]['key']
export type TenantCounts = Partial<Record<TenantTabKey, number>>

/**
 * Onglets qui comptent dans le badge « Locataires » : seulement ce qui attend une réponse du
 * propriétaire (visites à traiter, candidatures en attente). Les demandes sont celles de tout
 * le marché : leur total resterait élevé en permanence et le badge ne signalerait plus rien.
 * Leur compteur reste affiché sur l'onglet Demandes lui-même.
 */
const BADGE_TABS: readonly TenantTabKey[] = ['visites', 'candidatures']

/** Badge de l'entrée « Locataires » : la somme des compteurs connus, un compteur absent (appel échoué) ne compte pas. */
export function tenantsBadgeCount(counts: TenantCounts): number {
  return BADGE_TABS.reduce((sum, key) => {
    const n = counts[key]
    return sum + (typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : 0)
  }, 0)
}

/** Libellé d'un badge de menu : vide à zéro (pas de « 0 » qui attire l'œil pour rien), plafonné à « 99+ ». */
export function navBadgeLabel(n: number | undefined): string {
  if (!n || n <= 0) return ''
  return n > 99 ? '99+' : String(n)
}
