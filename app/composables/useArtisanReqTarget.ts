import type { ArtisanProfile } from '~/types/artisan'

/**
 * Artisan présélectionné dans « Demander une intervention » quand on part d'une
 * fiche de l'annuaire (pro/artisans) : la modale ouvre le mode « Artisan précis »
 * sur son métier, l'artisan déjà coché. Vidé à la fermeture de la modale.
 */
export function useArtisanReqTarget() {
  return useState<{ profile: ArtisanProfile; tradeId: string } | null>('artisanReqTarget', () => null)
}
