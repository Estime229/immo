/**
 * Descriptions d'annonce : les propriétaires collent souvent un texte préparé
 * sur WhatsApp (« *Récente construction* », « _calme_ », « - Cuisine équipée »),
 * et la fiche affichait les astérisques bruts. Ce module découpe le texte en
 * blocs (paragraphes, listes à puces, intertitres) et en morceaux gras / italique.
 *
 * Convention WhatsApp d'abord, parce que c'est d'où viennent les annonces au
 * Bénin : `*texte*` = gras, `_texte_` = italique. Le Markdown `**gras**` et
 * `***gras italique***` reste compris. Les astérisques orphelins laissés par une
 * mise en forme mal refermée (« **RÉCENTE CONSTRUCTION* ») sont retirés.
 *
 * Aucune balise HTML n'est produite : le template rend la structure avec des
 * interpolations `{{ }}`, que Vue échappe. Un `<script>` tapé par un
 * propriétaire reste donc du texte, sans `v-html` à surveiller.
 */

export interface RichSpan {
  text: string
  bold: boolean
  italic: boolean
}

/** Une ligne de texte : une suite de morceaux mis en forme. */
export type RichLine = RichSpan[]

export type RichBlock =
  /** Lignes consécutives : les retours à la ligne simples sont gardés (le propriétaire les a voulus). */
  | { type: 'paragraph'; lines: RichLine[] }
  | { type: 'list'; items: RichLine[] }
  /** « ## Le quartier » : rendu comme un intertitre plutôt qu'avec ses dièses. */
  | { type: 'heading'; line: RichLine }

/** « - item », « * item » ou « • item » en début de ligne (l'espace après le signe distingue la puce de « *gras* »). */
const LIST_ITEM = /^\s*[-*•]\s+(.*)$/
const HEADING = /^\s*#{1,6}\s+(.*)$/
/** « --- », « *** » : un séparateur Markdown, sans contenu à afficher. */
const RULE = /^\s*([-*_])(?:\s*\1){2,}\s*$/

/*
 * Pas de lookbehind (`(?<=…)`) : il casse le module entier sur les iPhone sous
 * iOS 16.3 et antérieurs, encore courants. Les bornes « pas d'espace, pas
 * d'astérisque » sont donc écrites avec des classes de caractères.
 */
/**
 * Dans l'ordre : ***gras italique***, **gras**, *gras* (WhatsApp), _italique_ (WhatsApp).
 * Groupes : 1 gras italique · 2 et 3 gras · 4 caractère qui précède le « _ » · 5 italique.
 * Le « _ » doit commencer un mot et finir avant une ponctuation ou un espace, pour ne pas
 * couper un identifiant (« villa_2 », « mon_wifi »).
 */
const INLINE = /\*\*\*([^\s*](?:[^*]*?[^\s*])?)\*\*\*|\*\*([^\s*](?:[\s\S]*?[^\s*])?)\*\*|\*([^\s*](?:[^*]*?[^\s*])?)\*|(^|[\s(«"'])_([^\s_](?:[^_]*?[^\s_])?)_(?=$|[\s.,;:!?)»"'])/g
/** Italique à l'intérieur d'un passage gras : mêmes bornes que le groupe 5 ci-dessus. */
const ITALIC = /(^|[\s(«"'])_([^\s_](?:[^_]*?[^\s_])?)_(?=$|[\s.,;:!?)»"'])/g

function pushSpan(out: RichSpan[], span: RichSpan) {
  if (!span.text) return
  const prev = out[out.length - 1]
  // Morceaux voisins de même style fusionnés : moins de nœuds, même rendu.
  if (prev && prev.bold === span.bold && prev.italic === span.italic) prev.text += span.text
  else out.push({ ...span })
}

/**
 * Texte brut entre deux passages mis en forme, sans les astérisques orphelins.
 * Un groupe d'astérisques est gardé quand il a un sens typographique : entouré d'espaces
 * (« prix * 2 ») ou collé derrière un chiffre (« Hôtel 3* », « 2*3 »). Sinon, collé à un mot,
 * c'est le reste d'une mise en forme mal refermée : on le retire.
 * @param line - ligne complète, pour lire les caractères voisins du segment
 * @param start - début du segment dans la ligne
 * @param end - fin (exclue) du segment dans la ligne
 */
function plainText(line: string, start: number, end: number): string {
  return line.slice(start, end).replace(/\*+/g, (run, offset: number) => {
    const before = line[start + offset - 1]
    const after = line[start + offset + run.length]
    const spacedBefore = before === undefined || /\s/.test(before)
    const spacedAfter = after === undefined || /\s/.test(after)
    if ((spacedBefore && spacedAfter) || (before !== undefined && /\d/.test(before))) return run
    return ''
  })
}

/** Italique `_x_` à l'intérieur d'un passage gras. */
function parseItalics(text: string, out: RichSpan[]) {
  let last = 0
  for (const m of text.matchAll(ITALIC)) {
    const italicStart = m.index + m[1]!.length
    pushSpan(out, { text: text.slice(last, italicStart), bold: true, italic: false })
    pushSpan(out, { text: m[2]!, bold: true, italic: true })
    last = m.index + m[0].length
  }
  pushSpan(out, { text: text.slice(last), bold: true, italic: false })
}

/**
 * Au-delà, une ligne est rendue telle quelle : l'alternative `**…**` de INLINE peut coûter un
 * temps quadratique sur une très longue ligne pleine de « ** » non refermés (saisie libre).
 * Une vraie ligne de description n'approche pas cette taille.
 */
const MAX_INLINE_LENGTH = 2000

/** Une ligne → morceaux gras / italique. */
export function parseInline(text: string): RichLine {
  if (text.length > MAX_INLINE_LENGTH) return text ? [{ text, bold: false, italic: false }] : []
  const out: RichSpan[] = []
  let last = 0
  for (const m of text.matchAll(INLINE)) {
    // Pour l'italique, le caractère qui précède le « _ » (groupe 4) appartient au texte brut.
    const markStart = m.index + (m[4]?.length ?? 0)
    pushSpan(out, { text: plainText(text, last, markStart), bold: false, italic: false })
    if (m[1] !== undefined) pushSpan(out, { text: m[1], bold: true, italic: true })
    else if (m[2] !== undefined) parseItalics(m[2], out)
    else if (m[3] !== undefined) parseItalics(m[3], out)
    else pushSpan(out, { text: m[5]!, bold: false, italic: true })
    last = m.index + m[0].length
  }
  pushSpan(out, { text: plainText(text, last, text.length), bold: false, italic: false })
  return out
}

/** Texte libre → blocs. Une ligne vide sépare les paragraphes ; les puces consécutives forment une liste. */
export function parseRichText(text: string | null | undefined): RichBlock[] {
  if (!text) return []
  const blocks: RichBlock[] = []
  let current: RichBlock | null = null
  const close = () => {
    if (current) blocks.push(current)
    current = null
  }

  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim()
    if (!line || RULE.test(line)) {
      close()
      continue
    }
    const heading = HEADING.exec(line)
    if (heading) {
      close()
      if (heading[1]!.trim()) blocks.push({ type: 'heading', line: parseInline(heading[1]!.trim()) })
      continue
    }
    const item = LIST_ITEM.exec(line)
    if (item) {
      const content = item[1]!.trim()
      if (!content) continue
      if (current?.type !== 'list') {
        close()
        current = { type: 'list', items: [] }
      }
      current.items.push(parseInline(content))
      continue
    }
    if (current?.type !== 'paragraph') {
      close()
      current = { type: 'paragraph', lines: [] }
    }
    current.lines.push(parseInline(line))
  }
  close()
  return blocks
}
