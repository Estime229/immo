/**
 * Noms saisis par les propriétaires et les référentiels (biens, logements,
 * quartiers, villes) : beaucoup arrivent en capitales (« AKASSATO »,
 * « Résidence DOSSOU »), ce qui crie dans une liste d'annonces. On ne touche
 * qu'à l'affichage : la valeur brute reste celle envoyée à l'API (filtres,
 * recherche par ville).
 *
 * Règle : un mot ENTIÈREMENT en majuscules d'au moins 5 lettres passe en casse
 * titre. En dessous, on le garde tel quel : ce sont le plus souvent des sigles
 * (« F3 », « CNHU », « BP », « SBEE ») qu'on ne doit pas défigurer.
 */

const MIN_LETTERS = 5

/** Mots-outils mis en minuscules quand le nom « crie » (sauf en tête) : « VILLA DE LA LAGUNE » → « Villa de la Lagune ». */
const FUNCTION_WORDS = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'et', 'à', 'au', 'aux', 'en', 'sur', 'sous'])

const UPPER = /\p{Lu}/u
const LOWER = /\p{Ll}/u
const LETTER = /\p{L}/gu

function isShouted(word: string): boolean {
  return UPPER.test(word) && !LOWER.test(word)
}

function letterCount(word: string): number {
  return word.match(LETTER)?.length ?? 0
}

/**
 * « ÉTOILE » → « Étoile » ; locale française pour les accents (É, È, Ç…). La
 * majuscule va sur la première LETTRE : « (DUPLEX) » → « (Duplex) ».
 */
function capitalize(segment: string): string {
  return segment.toLocaleLowerCase('fr').replace(/\p{L}/u, c => c.toLocaleUpperCase('fr'))
}

/**
 * Casse titre segment par segment : les traits d'union et apostrophes sont
 * gardés (« ABOMEY-CALAVI » → « Abomey-Calavi », « L'ÉTOILE » → « L'Étoile »).
 * Au milieu d'un nom, l'élision reste en minuscule : « d'Akpakpa ».
 */
function titleCaseWord(word: string, isFirst: boolean): string {
  const parts = word.split(/([-'’])/)
  return parts.map((part, i) => {
    if (i % 2 === 1) return part // séparateur
    if (!isFirst && i === 0 && parts.length > 1 && /^[dl]$/i.test(part) && /['’]/.test(parts[1] ?? '')) return part.toLocaleLowerCase('fr')
    return capitalize(part)
  }).join('')
}

export function displayName(value: string | null | undefined): string {
  if (!value) return ''
  const tokens = value.split(/(\s+)/)
  const words = tokens.filter((_, i) => i % 2 === 0)
  // Le nom contient au moins un mot long en capitales : c'est un nom « crié », les mots-outils peuvent redescendre.
  const shouting = words.some(w => isShouted(w) && letterCount(w) >= MIN_LETTERS)
  let wordIndex = -1
  return tokens.map((token, i) => {
    if (i % 2 === 1 || !token) return token // espaces conservés tels quels
    wordIndex++
    if (!isShouted(token)) return token
    if (letterCount(token) >= MIN_LETTERS) return titleCaseWord(token, wordIndex === 0)
    const lower = token.toLocaleLowerCase('fr')
    if (shouting && FUNCTION_WORDS.has(lower)) return wordIndex === 0 ? capitalize(lower) : lower
    return token
  }).join('')
}
