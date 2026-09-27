import { describe, expect, it } from 'vitest'
import {
  awaitingMySignature, cleanRooms, editableRooms, INVENTORY_ITEM_STATES, inventoryEditable, itemStateLabel, itemStateTone,
  nextRoomName, pickInventory, presetRoom, ROOM_PRESETS, validateInventoryForSend
} from '../app/utils/inventories'

describe('états d\'un élément — alignés sur l\'API (`ItemState`)', () => {
  it('propose exactement les codes imprimés sur le PDF', () => {
    expect(INVENTORY_ITEM_STATES.map(s => s.code)).toEqual(['new', 'good', 'fair', 'damaged', 'missing'])
  })
  it('lit encore l\'ancien « issue » et le convertit à l\'édition', () => {
    expect(itemStateLabel('issue')).toBe('À surveiller')
    expect(itemStateTone('issue')).toBe('warn')
    expect(editableRooms([{ name: 'Salon', items: [{ name: 'Murs', state: 'issue', comment: 'x', photo_count: 0 }] }])[0]!.items[0]!.state).toBe('fair')
    expect(itemStateLabel('damaged')).toBe('Abîmé')
    expect(itemStateTone('missing')).toBe('danger')
    expect(itemStateLabel('inconnu')).toBe('inconnu')
  })
})

describe('validation avant envoi — l\'API ne contrôle que « au moins une pièce »', () => {
  it('pièce requise, nommée, avec au moins un élément', () => {
    expect(validateInventoryForSend([])).toMatch(/au moins une pièce/)
    expect(validateInventoryForSend([{ name: '  ', items: [{ name: 'Sol', state: 'good', comment: '' }] }])).toMatch(/nom/)
    expect(validateInventoryForSend([{ name: 'Cuisine', items: [{ name: ' ', state: 'good', comment: '' }] }])).toMatch(/Cuisine/)
    expect(validateInventoryForSend([{ name: 'Cuisine', items: [{ name: 'Sol', state: 'good', comment: '' }] }])).toBeNull()
  })
  it('nettoie les espaces et retire les éléments sans nom', () => {
    expect(cleanRooms([{ name: ' Salon ', items: [{ name: ' Murs ', state: 'good', comment: ' ok ' }, { name: '', state: 'good', comment: '' }] }]))
      .toEqual([{ name: 'Salon', items: [{ name: 'Murs', state: 'good', comment: 'ok' }] }])
  })
})

describe('modèles de pièces', () => {
  it('ajoute une pièce pré-remplie, numérotée si elle existe déjà', () => {
    const chambre = ROOM_PRESETS.find(p => p.name === 'Chambre')!
    const room = presetRoom(chambre, ['Séjour', 'Chambre'])
    expect(room.name).toBe('Chambre 2')
    expect(room.items.length).toBeGreaterThan(3)
    expect(room.items.every(i => i.state === 'good')).toBe(true)
    expect(nextRoomName('Chambre', ['Chambre', 'Chambre 2'])).toBe('Chambre 3')
  })
})

describe('pickInventory — l\'API recrée un 2e état des lieux du même type (constaté en live)', () => {
  it('retient le signé, puis le plus récent', () => {
    const invs = [
      { id: 'new-draft', type: 'entry' as const, status: 'draft' as const, updated_at: '2026-09-27T19:00:00Z' },
      { id: 'signed', type: 'entry' as const, status: 'signed' as const, updated_at: '2026-09-27T18:00:00Z' },
      { id: 'exit', type: 'exit' as const, status: 'draft' as const, updated_at: '2026-09-27T20:00:00Z' }
    ]
    expect(pickInventory(invs, 'entry')?.id).toBe('signed')
    expect(pickInventory(invs, 'exit')?.id).toBe('exit')
    expect(pickInventory([], 'entry')).toBeNull()
  })
})

describe('qui peut modifier — l\'API laisse réécrire après une signature (#57)', () => {
  const pending = { status: 'pending_signature' as const, tenant_signature: null, landlord_signature: null }
  it('propriétaire : brouillon, ou envoi que personne n\'a signé', () => {
    expect(inventoryEditable({ ...pending, status: 'draft' }, false)).toBe(true)
    expect(inventoryEditable(pending, false)).toBe(true)
    expect(inventoryEditable({ ...pending, landlord_signature: 'data:image/png;base64,x' }, false)).toBe(false)
    expect(inventoryEditable({ ...pending, tenant_signature: 'data:image/png;base64,x' }, false)).toBe(false)
    expect(inventoryEditable({ ...pending, status: 'signed' }, false)).toBe(false)
  })
  it('locataire : jamais', () => {
    expect(inventoryEditable({ ...pending, status: 'draft' }, true)).toBe(false)
  })
  it('signature attendue selon le côté', () => {
    expect(awaitingMySignature({ ...pending, landlord_signature: 'x' }, true)).toBe(true)
    expect(awaitingMySignature({ ...pending, landlord_signature: 'x' }, false)).toBe(false)
    expect(awaitingMySignature({ ...pending, status: 'draft' }, true)).toBe(false)
  })
})
