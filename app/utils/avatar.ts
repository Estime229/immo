/** Prénom + nom sans « null » : l'API renvoie null tant que le profil n'est pas rempli. */
export function personName(first?: string | null, last?: string | null) {
  return [first, last].filter(Boolean).join(' ').trim()
}

/**
 * Indice de couleur stable pour un nom (pastille d'initiales, voir CoreAvatar) : somme des
 * codes de caractères modulo la taille de la palette, pour qu'une même personne garde sa
 * couleur partout. L'ancienne règle (longueur du nom) regroupait presque tout le monde sur
 * deux teintes.
 * @param name - nom affiché (vide accepté : indice 0)
 * @param paletteSize - nombre de teintes disponibles (> 0)
 * @returns un entier de 0 à paletteSize − 1
 */
export function avatarPaletteIndex(name: string, paletteSize: number): number {
  if (paletteSize <= 0) return 0
  let sum = 0
  for (const ch of name) sum += ch.codePointAt(0) ?? 0
  return sum % paletteSize
}
