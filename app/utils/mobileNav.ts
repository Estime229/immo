/**
 * Logique pure de la navigation mobile (barre d'onglets du bas) et de la
 * bannière « Téléchargez l'application » — isolée ici pour être testée sans
 * monter de composant (voir tests/mobileNav.test.ts).
 */

export type NavIconName =
  | 'search' | 'heart' | 'plus' | 'message' | 'user' | 'menu' | 'grid'
  | 'key' | 'wallet' | 'building' | 'inbox' | 'wrench' | 'calendar' | 'receipt'

export interface MobileTab {
  key: string
  label: string
  icon: NavIconName
  /** Absent : l'onglet est un bouton (ex. « Menu ») et la barre émet `select`. */
  to?: string
  active: boolean
  badge?: string
}

export type MobilePlatform = 'ios' | 'android' | 'other'

/** iPadOS 13+ se présente comme un Mac : seul `maxTouchPoints` (client uniquement) le trahit. */
export function detectMobilePlatform(userAgent: string | null | undefined, maxTouchPoints = 0): MobilePlatform {
  const ua = userAgent ?? ''
  if (/android/i.test(ua)) return 'android'
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios'
  if (/macintosh/i.test(ua) && maxTouchPoints > 1) return 'ios'
  return 'other'
}

export interface StoreUrls {
  ios: string
  android: string
}

/**
 * Lien du store adapté à l'appareil. Plateforme inconnue : Google Play d'abord
 * (Android est très largement majoritaire au Bénin), puis l'App Store. Chaîne
 * vide si aucun lien n'est configuré — la bannière annonce alors l'application
 * sans bouton cliquable plutôt qu'un lien mort.
 */
export function pickStoreUrl(platform: MobilePlatform, urls: StoreUrls): string {
  if (platform === 'ios') return urls.ios
  if (platform === 'android') return urls.android
  return urls.android || urls.ios
}

export function platformSubtitle(platform: MobilePlatform): string {
  if (platform === 'ios') return 'Accès facile et rapide à Immo, sur iPhone et iPad'
  if (platform === 'android') return 'Accès facile et rapide à Immo, sur Android'
  return 'Accès facile et rapide à Immo, sur iOS et Android'
}

export interface TabMatch {
  to: string
  /** Autres préfixes de chemin qui rendent l'onglet actif (ex. `/biens` pour « Explorer »). */
  alsoActiveOn?: readonly string[]
}

function pathMatches(path: string, prefix: string) {
  return path === prefix || path.startsWith(`${prefix}/`)
}

/**
 * Onglet actif pour un chemin donné. Un onglet racine (`/`, `/pro`, `/locataire`,
 * `/artisan`) n'est actif que sur son chemin exact : sans ça « Aperçu » resterait
 * allumé sur toutes les sous-pages de l'espace. Les autres onglets couvrent aussi
 * leurs sous-pages (`/pro/biens/fiche` garde « Biens » actif).
 */
export function isTabActive(path: string, tab: TabMatch, rootPaths: readonly string[] = ['/', '/pro', '/locataire', '/artisan']): boolean {
  const own = rootPaths.includes(tab.to) ? path === tab.to : pathMatches(path, tab.to)
  return own || (tab.alsoActiveOn ?? []).some(p => pathMatches(path, p))
}
