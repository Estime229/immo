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

/** Copie éditable des pièces, états hérités convertis vers un code accepté par l'API. */
export function editableRooms(rooms: InventoryRoom[] | undefined): InventoryRoom[] {
  return (rooms ?? []).map(r => ({
    name: r.name,
    items: r.items.map(i => ({ name: i.name, state: LEGACY_STATE[i.state] ?? i.state, comment: i.comment ?? '' }))
  }))
}

/** Nettoie avant envoi : noms rognés, objets sans nom retirés (l'API ne valide rien, #58). */
export function cleanRooms(rooms: InventoryRoom[]): InventoryRoom[] {
  return rooms.map(r => ({
    name: r.name.trim(),
    items: r.items.filter(i => i.name.trim()).map(i => ({ name: i.name.trim(), state: i.state, comment: (i.comment ?? '').trim() }))
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
