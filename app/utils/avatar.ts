/** Prénom + nom sans « null » : l'API renvoie null tant que le profil n'est pas rempli. */
export function personName(first?: string | null, last?: string | null) {
  return [first, last].filter(Boolean).join(' ').trim()
}
