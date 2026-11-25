/**
 * Équipements d'un logement, regroupés par catégorie pour la fiche publique :
 * une trentaine de pastilles à plat formaient un mur illisible.
 *
 * La catégorie ne vient pas de l'unité (`resolved_features` ne donne que le
 * code) mais du référentiel `FEATURE` (`GET /ref?type=FEATURE`), que la fiche
 * charge déjà pour les libellés. Elle y est rangée dans
 * `metadata.category_code` (voir scripts/referentiel-benin/importer.mjs et
 * l'admin des référentiels) ; `category` à la racine est aussi accepté, c'est
 * le nom du champ à la création (`POST /ref/admin`, exemple « comfort »).
 */

export interface FeatureRefEntry {
  code: string
  labels: Record<string, string>
  metadata?: Record<string, unknown> | null
  sort_order?: number
  category?: string
}

export interface FeatureItem {
  code: string
  label: string
}

export interface FeatureGroup {
  /** Code de catégorie en capitales (`COMFORT`…), ou `OTHER`. */
  key: string
  label: string
  items: FeatureItem[]
}

export const OTHER_FEATURE_CATEGORY = 'OTHER'

/** Codes du référentiel du Bénin (types-et-equipements.json), dans l'ordre d'importance pour un locataire. */
const KNOWN_CATEGORIES: Record<string, string> = {
  ESSENTIAL: 'Essentiel',
  COMFORT: 'Confort',
  SECURITY: 'Sécurité',
  EXTERIOR: 'Extérieur'
}
const KNOWN_ORDER = Object.keys(KNOWN_CATEGORIES)

function categoryCode(entry: FeatureRefEntry | undefined): string | null {
  const raw = entry?.metadata?.category_code ?? entry?.metadata?.category ?? entry?.category
  return typeof raw === 'string' && raw.trim() ? raw.trim().toUpperCase() : null
}

/** Code sans libellé (référentiel pas encore chargé) : « cuisine_interne » → « Cuisine interne », jamais le code brut. */
function humanizeCode(code: string): string {
  const text = code.replace(/[_-]+/g, ' ').trim()
  return text.charAt(0).toLocaleUpperCase('fr') + text.slice(1)
}

/**
 * Codes d'équipements → groupes ordonnés (Essentiel, Confort, Sécurité,
 * Extérieur, autres catégories du référentiel, puis « Autres »). Une catégorie
 * que l'on ne sait pas nommer — ni connue ici, ni libellée dans
 * `categoryLabels` (référentiel `FEATURE_CATEGORY`) — tombe dans « Autres ».
 */
export function groupFeatures(codes: string[], refs: FeatureRefEntry[], categoryLabels: Record<string, string> = {}): FeatureGroup[] {
  const byCode = new Map(refs.map(r => [r.code, r]))
  const labels: Record<string, string> = {}
  for (const [code, label] of Object.entries(categoryLabels)) labels[code.toUpperCase()] = label
  const groups = new Map<string, { label: string; items: (FeatureItem & { rank: number })[] }>()

  for (const code of new Set(codes.filter(Boolean))) {
    const entry = byCode.get(code)
    const cat = categoryCode(entry)
    const label = cat ? (labels[cat] ?? KNOWN_CATEGORIES[cat]) : undefined
    const key = cat && label ? cat : OTHER_FEATURE_CATEGORY
    const group = groups.get(key) ?? { label: label ?? 'Autres', items: [] }
    group.items.push({ code, label: entry?.labels.fr || entry?.labels.en || humanizeCode(code), rank: entry?.sort_order ?? Number.MAX_SAFE_INTEGER })
    groups.set(key, group)
  }

  const position = (key: string) => {
    if (key === OTHER_FEATURE_CATEGORY) return Number.MAX_SAFE_INTEGER
    const i = KNOWN_ORDER.indexOf(key)
    return i === -1 ? KNOWN_ORDER.length : i
  }
  return [...groups]
    .sort(([a, ga], [b, gb]) => position(a) - position(b) || ga.label.localeCompare(gb.label, 'fr'))
    .map(([key, g]) => ({
      key,
      label: g.label,
      items: g.items
        .sort((a, b) => a.rank - b.rank || a.label.localeCompare(b.label, 'fr'))
        .map(({ code, label }) => ({ code, label }))
    }))
}

/** Faut-il des intertitres ? Pas quand aucune catégorie n'est connue : une seule liste « Autres » n'apprend rien. */
export function hasFeatureCategories(groups: FeatureGroup[]): boolean {
  return groups.some(g => g.key !== OTHER_FEATURE_CATEGORY)
}
