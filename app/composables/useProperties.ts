/**
 * Fonds décoratifs du héros : photos réelles (résidences tropicales, Afrique
 * de l'Ouest) aux indices 0, 2 et 6, utilisés par le carrousel de l'accueil ;
 * ailleurs, faute de photographie pour ces emplacements, un aplat de la palette
 * (vert, terracotta, sable, bleu d'information) — plus de dégradé décoratif.
 *
 * Chaque entrée est une valeur de la propriété CSS `background` (une image
 * `url(…)` ou une couleur) : à appliquer avec `background`, pas
 * `background-image`, qui ignorerait une couleur.
 */
export const PHOTO_BACKGROUNDS = [
  'url(/images/hero/hero-1.jpg)',
  'var(--color-clay-100)',
  'url(/images/hero/hero-2.jpg)',
  'var(--color-green-100)',
  'var(--color-sand-200)',
  'var(--color-info-bg)',
  'url(/images/hero/hero-3.jpg)',
  'var(--color-green-50)'
]

/** "75000" -> "75 000 FCFA" — espace fine comme séparateur de milliers, jamais de virgule. */
export function formatFcfa(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' FCFA'
}

/** Même formatage, en "F" pour un contexte serré (carte, tableau). */
export function formatFcfaShort(n: number): string {
  return formatFcfa(n).replace(' FCFA', ' F')
}

/**
 * Le catalogue mock `PROPERTIES` a été retiré : plus aucune page ne
 * l'utilise depuis la migration de la recherche/fiche logement sur l'API
 * réelle (I4). `photos` reste utilisé pour des fonds purement décoratifs
 * (héros) là où aucune photo d'annonce n'a de sens.
 */
export function useProperties() {
  return { photos: PHOTO_BACKGROUNDS, formatFcfa, formatFcfaShort }
}
