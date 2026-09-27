import { describe, expect, it } from 'vitest'
import { expiryLabel, groupPermissions, inviteLink, inviteOutcome, mandatorName, agentName, memberName, propertiesOfAgent, roleLabel, validateInvite } from '../app/utils/team'
import type { Mandate, MyTeam } from '../app/types/team'

const team: MyTeam = {
  team: { id: 't', name: 'Agence QA', owner_id: 'o', created_at: '2026-09-27' },
  members: [{ id: 'm', user_id: 'u', first_name: null, last_name: null, email: 'tenant@example.com', avatar_url: null, role_preset: 'observateur', custom_preset_name: null, permissions: [], status: 'pending', joined_at: null, properties: [] }],
  invitations: [{ id: 'i', email: 'qa-membre@example.com', role_preset: 'gestionnaire', custom_preset_name: null, permissions: [], property_ids: [], status: 'pending', expires_at: '2026-10-04T23:02:10Z' }]
}
const ok = { email: 'nouveau@example.com', preset: 'gestionnaire', customPresetId: '', permissions: ['team:leases:create'], propertyIds: ['p1'] }

describe('registre des permissions', () => {
  it('groupe par catégorie dans l\'ordre de l\'API', () => {
    const g = groupPermissions([
      { key: 'a', label: 'Voir les biens', category: 'Biens' },
      { key: 'b', label: 'Créer des baux', category: 'Baux' },
      { key: 'c', label: 'Modifier les biens', category: 'Biens' }
    ])
    expect(g.map(x => [x.category, x.items.length])).toEqual([['Biens', 2], ['Baux', 1]])
  })
  it('libellé du poste : nommé, personnalisé, ou preset du registre', () => {
    const reg = { permissions: [], presets: { gestionnaire: { label: 'Gestionnaire', permissions: [] } } }
    expect(roleLabel(reg, 'gestionnaire')).toBe('Gestionnaire')
    expect(roleLabel(reg, 'custom', 'Gardien')).toBe('Gardien')
    expect(roleLabel(reg, 'custom')).toBe('Poste personnalisé')
    expect(memberName(team.members[0]!)).toBe('tenant@example.com')
  })
})

describe('invitation', () => {
  it('contrôles avant envoi (l\'API répond « Données invalides » sans préciser)', () => {
    expect(validateInvite(ok, team)).toBeNull()
    expect(validateInvite({ ...ok, email: 'pas-un-email' }, team)).toMatch(/e-mail/)
    expect(validateInvite({ ...ok, preset: '' }, team)).toMatch(/poste/)
    expect(validateInvite({ ...ok, permissions: [] }, team)).toMatch(/permission/)
    expect(validateInvite({ ...ok, propertyIds: [] }, team)).toMatch(/bien/)
    expect(validateInvite({ ...ok, email: 'QA-membre@example.com' }, team)).toMatch(/déjà une invitation/)
    expect(validateInvite({ ...ok, email: 'tenant@example.com' }, team)).toMatch(/déjà partie/)
  })
  it('après un 500 : ce qui a vraiment été enregistré (#4)', () => {
    expect(inviteOutcome(team, 'qa-membre@example.com')).toBe('invitation')
    expect(inviteOutcome(team, 'tenant@example.com')).toBe('member')
    expect(inviteOutcome(team, 'autre@example.com')).toBe('missing')
  })
  it('lien d\'invitation et échéance', () => {
    expect(inviteLink('https://im-hazel.vercel.app/', 'abc')).toBe('https://im-hazel.vercel.app/invite/abc')
    const now = new Date('2026-09-28T10:00:00Z')
    expect(expiryLabel('2026-10-04T23:02:10Z', now)).toEqual({ text: 'expire dans 7 jours', expired: false })
    expect(expiryLabel('2026-09-27T10:00:00Z', now)).toEqual({ text: 'expirée', expired: true })
  })
})

describe('mandats', () => {
  const base: Mandate = { id: 'm', agent_id: 'a', mandator_type: 'landlord', landlord_id: 'l', agency_id: null, status: 'active', created_at: '', updated_at: '' }
  it('noms avec repli quand l\'API ne renvoie ni nom ni e-mail (constaté en live)', () => {
    expect(mandatorName({ ...base, landlord: { id: 'l', first_name: null, last_name: null } })).toBe('Un propriétaire (nom non renseigné)')
    expect(mandatorName({ ...base, mandator_type: 'agency', agency: { id: 'g', first_name: 'Awa', last_name: null, company_name: 'Immo Plus' } })).toBe('Immo Plus')
    expect(agentName({ ...base, agent: { id: 'a', first_name: 'Agathe', last_name: 'Agent', email: 'x@y.z' } })).toBe('Agathe Agent')
    expect(agentName({ ...base, agent: { id: 'a', first_name: null, last_name: null, email: 'x@y.z' } })).toBe('x@y.z')
  })
  it('biens où l\'agent est désigné', () => {
    expect(propertiesOfAgent([{ id: '1', name: 'A', agent_id: 'a' }, { id: '2', name: 'B', agent_id: null }], 'a').map(p => p.id)).toEqual(['1'])
  })
})
