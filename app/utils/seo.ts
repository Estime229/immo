/**
 * Titres et descriptions de l'espace public (Lot 56) : aucune page n'avait de
 * <title> ni de langue déclarée — onglets vides, partages WhatsApp et
 * résultats de recherche sans libellé.
 */
export const SITE_NAME = 'Immo'
export const DEFAULT_TITLE = 'Immo — Louer en toute confiance au Bénin'
export const DEFAULT_DESCRIPTION = 'Logements à louer au mois ou à la nuit à Cotonou et au Bénin : annonces vérifiées, loyers payés en Mobile Money, caution protégée jusqu\'à l\'état des lieux de sortie.'

export function formatTitle(title: string | null | undefined): string {
  const t = (title ?? '').trim()
  return t ? `${t} · ${SITE_NAME}` : DEFAULT_TITLE
}

/**
 * Titre par défaut d'une route publique quand la page n'en donne pas (pages
 * dont le fichier ne peut pas être modifié dans ce lot, ou chargement en
 * cours). Les espaces connectés ont leur propre titre via leur layout.
 */
export function publicRouteTitle(path: string): string | null {
  if (path === '/') return null
  if (path === '/recherche') return 'Rechercher un logement'
  if (path.startsWith('/biens/')) return 'Logement à louer'
  if (path.startsWith('/vitrine/')) return 'Vitrine'
  const STATIC: Record<string, string> = {
    '/louer': 'Louer votre bien',
    '/faq': 'Questions fréquentes',
    '/contact': 'Nous contacter',
    '/legal': 'Politique de confidentialité',
    '/favoris': 'Mes favoris',
    '/connexion': 'Connexion',
    '/kyc': 'Vérifier mon compte',
    '/payment/return': 'Retour de paiement'
  }
  if (path.startsWith('/invite/')) return 'Invitation'
  return STATIC[path] ?? null
}

/** Pages à ne pas indexer : espaces connectés, flux techniques, maquette interne. */
export function isPrivatePath(path: string): boolean {
  return ['/locataire', '/pro', '/artisan', '/kyc', '/connexion', '/invite', '/payment', '/design-system'].some(p => path === p || path.startsWith(`${p}/`))
}
