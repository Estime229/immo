import { describe, expect, it } from 'vitest'
import {
  awaitingMySignature, cleanRooms, compareItem, editableRooms, entryStates, exitDegradations, hasUnresolvedPhotos, INVENTORY_ITEM_STATES,
  inventoryChanged, inventoryEditable, itemStateLabel, itemStateTone, meterConsumption, nextRoomName, pickInventory, presetRoom, ROOM_PRESETS,
  roomsFromEntry, validateInventoryForSend
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
      .toEqual([{ name: 'Salon', items: [{ name: 'Murs', state: 'good', comment: 'ok', photos: [] }] }])
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

describe('photos — l\'API ne renvoie que leur nombre, et les efface si on réenregistre sans les URLs (#71)', () => {
  const server = [{ name: 'Salon', items: [{ name: 'Murs', state: 'fair', comment: '', photo_count: 2 }, { name: 'Sol', state: 'good', comment: '', photo_count: 0 }] }]
  it('garde la position d\'origine et les photos serveur à récupérer', () => {
    const rooms = editableRooms(server)
    expect(rooms[0]!.items[0]!._origin).toEqual({ ri: 0, ii: 0 })
    expect(rooms[0]!.items[0]!._existing).toEqual([0, 1])
    expect(rooms[0]!.items[1]!._existing).toEqual([])
    expect(hasUnresolvedPhotos(rooms)).toBe(true)
  })
  it('une fois récupérées, plus rien ne bloque ; les champs internes ne partent jamais', () => {
    const rooms = editableRooms(server)
    rooms[0]!.items[0]!._existing = []
    rooms[0]!.items[0]!.photos = ['https://stockage/a.webp']
    expect(hasUnresolvedPhotos(rooms)).toBe(false)
    const out = cleanRooms(rooms)[0]!.items[0]!
    expect(out).toEqual({ name: 'Murs', state: 'fair', comment: '', photos: ['https://stockage/a.webp'] })
  })
})

describe('sortie comparée à l\'entrée', () => {
  const entry = [{ name: 'Séjour', items: [{ name: 'Murs', state: 'good', comment: 'RAS' }, { name: 'Sol', state: 'fair', comment: '' }, { name: 'Prises', state: 'issue', comment: '' }] }]
  it('retrouve l\'état d\'entrée malgré accents et casse, signale les dégradations', () => {
    const m = entryStates(entry)
    expect(compareItem(m, 'sejour', ' MURS ', 'damaged')).toEqual({ entryState: 'good', degraded: true })
    expect(compareItem(m, 'Séjour', 'Sol', 'fair')).toEqual({ entryState: 'fair', degraded: false })
    expect(compareItem(m, 'Séjour', 'Sol', 'good')).toEqual({ entryState: 'fair', degraded: false })
    expect(compareItem(m, 'Cuisine', 'Évier', 'damaged')).toEqual({ entryState: null, degraded: false })
  })
  it('liste ce qui s\'est dégradé (base de la discussion sur la caution)', () => {
    const exit = [{ name: 'Séjour', items: [{ name: 'Murs', state: 'damaged', comment: '' }, { name: 'Sol', state: 'fair', comment: '' }, { name: 'Prises', state: 'missing', comment: '' }] }]
    expect(exitDegradations(exit, entry)).toEqual([
      { room: 'Séjour', item: 'Murs', from: 'good', to: 'damaged' },
      { room: 'Séjour', item: 'Prises', from: 'issue', to: 'missing' }
    ])
  })
  it('part des pièces de l\'entrée, états repris, sans remarques ni photos', () => {
    const rooms = roomsFromEntry(entry)
    expect(rooms[0]!.items.map(i => [i.name, i.state, i.comment, i.photos])).toEqual([['Murs', 'good', '', []], ['Sol', 'fair', '', []], ['Prises', 'fair', '', []]])
  })
  it('consommation entre les relevés, ignorée si illisible ou négative', () => {
    expect(meterConsumption({ electricity: '04521', water: '0318' }, { electricity: '04890', water: '0300' })).toEqual({ electricity: 369, water: null })
    expect(meterConsumption({ electricity: '12,5' }, { electricity: '20' })).toEqual({ electricity: 7.5, water: null })
    expect(meterConsumption(null, { electricity: 'abc' })).toEqual({ electricity: null, water: null })
  })
  it('contenu modifié depuis l\'affichage', () => {
    expect(inventoryChanged({ updated_at: '2026-09-27T10:00:00Z' }, { updated_at: '2026-09-27T10:05:00Z' })).toBe(true)
    expect(inventoryChanged({ updated_at: '2026-09-27T10:00:00Z' }, { updated_at: '2026-09-27T10:00:00Z' })).toBe(false)
  })
})
