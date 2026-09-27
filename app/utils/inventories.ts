import type { InventoryDetail, InventoryRoom, InventoryType } from '../types/tenant'

/**
 * États acceptés par l'API (`ItemState`) et imprimés sur le PDF de l'état des
 * lieux. Le front proposait « issue » (« À surveiller »), inconnu du serveur :
 * l'objet sortait sans état sur le PDF (constaté en live, Lot 50).
 */
export const INVENTORY_ITEM_STATES: { code: string; label: string }[] = [
  { code: 'new', label: 'Neuf' },
  { code: 'good', label: 'Bon état' },
  { code: 'fair', label: "Traces d'usage" },
  { code: 'damaged', label: 'Abîmé' },
  { code: 'missing', label: 'Manquant' }
]

const LEGACY_STATE: Record<string, string> = { issue: 'fair' }

export function itemStateLabel(state: string): string {
  if (state === 'issue') return 'À surveiller'
  return INVENTORY_ITEM_STATES.find(s => s.code === state)?.label ?? state
}

export function itemStateTone(state: string): 'ok' | 'warn' | 'danger' | 'neutral' {
  if (state === 'damaged' || state === 'missing') return 'danger'
  if (state === 'fair' || state === 'issue') return 'warn'
  if (state === 'new' || state === 'good') return 'ok'
  return 'neutral'
}

/**
 * Copie éditable des pièces, états hérités convertis vers un code accepté par
 * l'API. Chaque élément garde sa position d'origine et la liste des photos
 * serveur (`_existing`, des index) : l'API ne renvoie que leur nombre, et un
 * enregistrement sans leurs URLs les effacerait (#71). Elles sont donc
 * récupérées puis renvoyées avant tout enregistrement (`useInventoryPhotos`).
 */
export function editableRooms(rooms: InventoryRoom[] | undefined): InventoryRoom[] {
  return (rooms ?? []).map((r, ri) => ({
    name: r.name,
    items: r.items.map((i, ii) => ({
      name: i.name,
      state: LEGACY_STATE[i.state] ?? i.state,
      comment: i.comment ?? '',
      photos: [],
      _origin: { ri, ii },
      _existing: Array.from({ length: i.photo_count ?? 0 }, (_, k) => k)
    }))
  }))
}

/** Des photos du serveur n'ont pas encore été récupérées : enregistrer maintenant les effacerait. */
export function hasUnresolvedPhotos(rooms: InventoryRoom[]): boolean {
  return rooms.some(r => r.items.some(i => (i._existing?.length ?? 0) > 0))
}

/** Nettoie avant envoi : noms rognés, objets sans nom retirés, champs internes ôtés (l'API ne valide rien, #63). */
export function cleanRooms(rooms: InventoryRoom[]): InventoryRoom[] {
  return rooms.map(r => ({
    name: r.name.trim(),
    items: r.items.filter(i => i.name.trim()).map(i => ({ name: i.name.trim(), state: i.state, comment: (i.comment ?? '').trim(), photos: [...(i.photos ?? [])] }))
  }))
}

export function validateInventoryForSend(rooms: InventoryRoom[]): string | null {
  const cleaned = cleanRooms(rooms)
  if (!cleaned.length) return 'Ajoutez au moins une pièce avant d\'envoyer.'
  if (cleaned.some(r => !r.name)) return 'Chaque pièce doit avoir un nom.'
  const empty = cleaned.find(r => !r.items.length)
  if (empty) return `Ajoutez au moins un élément constaté dans « ${empty.name} ».`
  return null
}

export const INVENTORY_STATUS_LABEL: Record<string, string> = { draft: 'Brouillon', pending_signature: 'À signer', signed: 'Signé' }
export const INVENTORY_STATUS_TONE: Record<string, 'ok' | 'warn' | 'neutral'> = { draft: 'neutral', pending_signature: 'warn', signed: 'ok' }
export const INVENTORY_TYPE_LABEL: Record<InventoryType, string> = { entry: "État des lieux d'entrée", exit: 'État des lieux de sortie' }

/**
 * L'API recrée un état des lieux du même type dès que le précédent n'est
 * plus un brouillon (constaté en live : deux « entrée » sur un même bail) —
 * on retient le plus avancé, puis le plus récent.
 */
export function pickInventory<T extends Pick<InventoryDetail, 'type' | 'status' | 'updated_at'>>(invs: T[], type: InventoryType): T | null {
  const rank: Record<string, number> = { signed: 0, pending_signature: 1, draft: 2 }
  return invs
    .filter(i => i.type === type)
    .sort((a, b) => (rank[a.status] ?? 3) - (rank[b.status] ?? 3) || b.updated_at.localeCompare(a.updated_at))[0] ?? null
}

/**
 * Qui peut encore modifier le contenu. L'API laisse les deux parties tout
 * réécrire jusqu'à la double signature, même après une première signature
 * (faille #57) : le front ne modifie qu'un brouillon, ou un envoi que
 * personne n'a encore signé — et jamais côté locataire.
 */
export function inventoryEditable(inv: Pick<InventoryDetail, 'status' | 'tenant_signature' | 'landlord_signature'> | null, isTenant: boolean): boolean {
  if (!inv || isTenant) return false
  if (inv.status === 'draft') return true
  return inv.status === 'pending_signature' && !inv.tenant_signature && !inv.landlord_signature
}

/** Ma signature est-elle attendue ? */
export function awaitingMySignature(inv: Pick<InventoryDetail, 'status' | 'tenant_signature' | 'landlord_signature'> | null, isTenant: boolean): boolean {
  if (inv?.status !== 'pending_signature') return false
  return isTenant ? !inv.tenant_signature : !inv.landlord_signature
}

/**
 * Pièces courantes et leurs éléments à constater — un clic ajoute la pièce
 * pré-remplie (état « Bon état » par défaut), qu'on ajuste ensuite. Avant :
 * chaque élément se tapait à la main, pièce par pièce.
 */
const BASE_ITEMS = ['Murs', 'Sol', 'Plafond', 'Porte', 'Fenêtres', 'Prises et interrupteurs', 'Éclairage']
export const ROOM_PRESETS: { name: string; items: string[] }[] = [
  { name: 'Séjour', items: BASE_ITEMS },
  { name: 'Chambre', items: [...BASE_ITEMS, 'Placard'] },
  { name: 'Cuisine', items: [...BASE_ITEMS, 'Évier et robinetterie', 'Plan de travail', 'Placards'] },
  { name: "Salle d'eau", items: ['Murs', 'Sol', 'Porte', 'Douche ou baignoire', 'Lavabo et robinetterie', 'Éclairage'] },
  { name: 'WC', items: ['Murs', 'Sol', 'Porte', 'Cuvette et chasse d\'eau'] },
  { name: 'Extérieur', items: ['Portail', 'Cour', 'Clôture'] }
]

/** Nom libre pour une pièce déjà présente : « Chambre » → « Chambre 2 ». */
export function nextRoomName(name: string, existing: string[]): string {
  if (!existing.includes(name)) return name
  let n = 2
  while (existing.includes(`${name} ${n}`)) n++
  return `${name} ${n}`
}

export function presetRoom(preset: { name: string; items: string[] }, existing: string[]): InventoryRoom {
  return { name: nextRoomName(preset.name, existing), items: preset.items.map(name => ({ name, state: 'good', comment: '' })) }
}

/* ---- Sortie comparée à l'entrée (Lot 52) ---- */

/** Gravité croissante ; « issue » (ancien état du front) vaut « traces d'usage ». */
export const STATE_RANK: Record<string, number> = { new: 0, good: 1, fair: 2, issue: 2, damaged: 3, missing: 4 }

function norm(s: string) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}
function key(room: string, item: string) {
  return `${norm(room)}|${norm(item)}`
}

/** État d'entrée de chaque élément, retrouvé par nom de pièce et d'élément (accents et casse ignorés). */
export function entryStates(entryRooms: InventoryRoom[] | undefined): Map<string, string> {
  const m = new Map<string, string>()
  for (const r of entryRooms ?? []) for (const i of r.items) m.set(key(r.name, i.name), i.state)
  return m
}

export function compareItem(entry: Map<string, string>, room: string, item: string, state: string): { entryState: string | null; degraded: boolean } {
  const entryState = entry.get(key(room, item)) ?? null
  const degraded = entryState !== null && (STATE_RANK[state] ?? 0) > (STATE_RANK[entryState] ?? 0)
  return { entryState, degraded }
}

/** Ce qui s'est dégradé entre l'entrée et la sortie — la base d'une discussion sur la caution. */
export function exitDegradations(exitRooms: InventoryRoom[], entryRooms: InventoryRoom[] | undefined): { room: string; item: string; from: string; to: string }[] {
  const entry = entryStates(entryRooms)
  const out: { room: string; item: string; from: string; to: string }[] = []
  for (const r of exitRooms) for (const i of r.items) {
    const c = compareItem(entry, r.name, i.name, i.state)
    if (c.degraded && c.entryState) out.push({ room: r.name, item: i.name, from: c.entryState, to: i.state })
  }
  return out
}

/** Point de départ d'une sortie : les pièces et éléments de l'entrée, avec leur état d'alors, sans photos ni remarques. */
export function roomsFromEntry(entryRooms: InventoryRoom[] | undefined): InventoryRoom[] {
  return (entryRooms ?? []).map(r => ({
    name: r.name,
    items: r.items.map(i => ({ name: i.name, state: LEGACY_STATE[i.state] ?? i.state, comment: '', photos: [], _existing: [] }))
  }))
}

/** Consommation entre les deux relevés (compteurs saisis en texte libre ; ignorée si illisible ou négative). */
export function meterConsumption(entry: { electricity?: string; water?: string } | null | undefined, exit: { electricity?: string; water?: string } | null | undefined) {
  const num = (v?: string) => {
    const n = Number((v ?? '').replace(/\s/g, '').replace(',', '.'))
    return v && Number.isFinite(n) ? n : null
  }
  const diff = (a?: string, b?: string) => {
    const x = num(a); const y = num(b)
    return x !== null && y !== null && y >= x ? Math.round((y - x) * 100) / 100 : null
  }
  return { electricity: diff(entry?.electricity, exit?.electricity), water: diff(entry?.water, exit?.water) }
}

/** Le contenu a-t-il changé depuis qu'on l'a affiché ? (vérifié juste avant de signer) */
export function inventoryChanged(shown: Pick<InventoryDetail, 'updated_at'>, fresh: Pick<InventoryDetail, 'updated_at'>): boolean {
  return shown.updated_at !== fresh.updated_at
}

