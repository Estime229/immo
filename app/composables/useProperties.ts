/**
 * Fonds décoratifs du héros/catégories : photos réelles (résidences tropicales,
 * Afrique de l'Ouest) là où le carrousel héros les utilise (indices 0, 2, 6),
 * dégradés de substitution ailleurs faute de photographies réelles pour ces
 * emplacements (voir readme.md du design system).
 */
export const PHOTO_GRADIENTS = [
  'url(/images/hero/hero-1.jpg)',
  'radial-gradient(120% 80% at 20% 0%, rgba(255,255,255,.42), transparent 58%), linear-gradient(148deg, #f5dcc5, #de9c68 52%, #895328)',
  'url(/images/hero/hero-2.jpg)',
  'radial-gradient(120% 80% at 20% 0%, rgba(255,255,255,.42), transparent 58%), linear-gradient(148deg, #fdf1dd, #f2ac3c 52%, #a9672f)',
  'radial-gradient(120% 80% at 20% 0%, rgba(255,255,255,.38), transparent 58%), linear-gradient(148deg, #e7e0d3, #a0937c 52%, #453d32)',
  'radial-gradient(120% 80% at 20% 0%, rgba(255,255,255,.42), transparent 58%), linear-gradient(148deg, #fce8ec, #e3506b 52%, #8a2440)',
  'url(/images/hero/hero-3.jpg)',
  'radial-gradient(120% 80% at 20% 0%, rgba(255,255,255,.4), transparent 58%), linear-gradient(148deg, #f2e3d2, #c2a17a 52%, #693f1f)'
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
 * réelle (I4). `photos` reste utilisé pour des dégradés purement décoratifs
 * (héros, catégories) là où aucune photo réelle n'a de sens.
 */
export function useProperties() {
  return { photos: PHOTO_GRADIENTS, formatFcfa, formatFcfaShort }
}
