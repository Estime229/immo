import { describe, expect, it } from 'vitest'
import { isProAdvanced, navBadgeLabel, navKeyForPath, TENANT_TABS, tenantsBadgeCount, visibleNavGroups } from '../app/utils/proNav'
import { NAV_GROUPS } from '../app/composables/useProSpace'

const keysOf = (groups: Array<{ items: Array<{ key: string }> }>) => groups.flatMap(g => g.items.map(i => i.key))

describe('isProAdvanced — interrupteur V1 (NUXT_PUBLIC_PRO_ADVANCED)', () => {
  it("n'accepte que les formes explicites du « oui »", () => {
    expect(isProAdvanced(true)).toBe(true)
    expect(isProAdvanced('true')).toBe(true)
    expect(isProAdvanced(' TRUE ')).toBe(true)
    expect(isProAdvanced('1')).toBe(true)
    expect(isProAdvanced(1)).toBe(true)
  })

  it('reste fermé par défaut et sur toute autre valeur', () => {
    expect(isProAdvanced(false)).toBe(false)
    expect(isProAdvanced(undefined)).toBe(false)
    expect(isProAdvanced('')).toBe(false)
    expect(isProAdvanced('false')).toBe(false)
    expect(isProAdvanced('0')).toBe(false)
    expect(isProAdvanced('yes')).toBe(false)
  })
})

describe('visibleNavGroups — filtrage du menu selon le drapeau', () => {
  const groups = [
    { header: '', items: [{ key: 'apercu', to: '/pro' }] },
    { header: 'Équipe et partenaires', items: [{ key: 'equipe', to: '/pro/equipe', advanced: true }, { key: 'mandats', to: '/pro/mandats', advanced: true }] },
    { header: 'Mixte', items: [{ key: 'wallet', to: '/pro/wallet' }, { key: 'artisans', to: '/pro/artisans', advanced: true }] }
  ]

  it('masque les rubriques avancées et retire un groupe vidé, intitulé compris', () => {
    const out = visibleNavGroups(groups, false)
    expect(out.map(g => g.header)).toEqual(['', 'Mixte'])
    expect(keysOf(out)).toEqual(['apercu', 'wallet'])
  })

  it('réaffiche tout quand le drapeau est levé', () => {
    expect(keysOf(visibleNavGroups(groups, true))).toEqual(['apercu', 'equipe', 'mandats', 'wallet', 'artisans'])
  })

  it('ne modifie pas les groupes reçus', () => {
    visibleNavGroups(groups, false)
    expect(groups[1]!.items).toHaveLength(2)
  })
})

describe('NAV_GROUPS — menu réel de l\'espace pro', () => {
  it('sans le drapeau : Équipe, Mandats et Artisans disparaissent, Locataires remplace Demandes/Visites/Candidatures', () => {
    const keys = keysOf(visibleNavGroups(NAV_GROUPS, false))
    expect(keys).not.toContain('equipe')
    expect(keys).not.toContain('mandats')
    expect(keys).not.toContain('artisans')
    expect(keys).toContain('locataires')
    for (const t of TENANT_TABS) expect(keys).not.toContain(t.key)
    // 18 entrées avant l'audit UX ; 13 maintenant.
    expect(keys).toHaveLength(13)
  })

  it('avec le drapeau : les trois rubriques reviennent, toujours sans doublon des pages Locataires', () => {
    const keys = keysOf(visibleNavGroups(NAV_GROUPS, true))
    expect(keys).toEqual(expect.arrayContaining(['equipe', 'mandats', 'artisans', 'locataires']))
    expect(keys).toHaveLength(16)
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe('navKeyForPath — entrée allumée pour une page', () => {
  const items = NAV_GROUPS.flatMap(g => [...g.items])

  it('allume « Locataires » sur ses trois pages', () => {
    expect(navKeyForPath(items, '/pro/demandes')).toBe('locataires')
    expect(navKeyForPath(items, '/pro/visites')).toBe('locataires')
    expect(navKeyForPath(items, '/pro/candidatures')).toBe('locataires')
  })

  it('rattache les sous-pages à leur rubrique, jamais à « Aperçu »', () => {
    expect(navKeyForPath(items, '/pro')).toBe('apercu')
    expect(navKeyForPath(items, '/pro/biens/fiche')).toBe('biens')
    expect(navKeyForPath(items, '/pro/baux/42')).toBe('baux')
    expect(navKeyForPath(items, '/pro/bauxxx')).toBe('apercu')
  })

  it('garde la clé d\'une rubrique masquée ouverte par son URL (titre « Équipe », pas « Aperçu »)', () => {
    expect(navKeyForPath(items, '/pro/equipe')).toBe('equipe')
    expect(navKeyForPath(items, '/pro/mandats')).toBe('mandats')
  })

  it('préfère le préfixe le plus long', () => {
    const nested = [{ key: 'a', to: '/pro/x' }, { key: 'b', to: '/pro/x/y' }]
    expect(navKeyForPath(nested, '/pro/x/y/z')).toBe('b')
    expect(navKeyForPath(nested, '/pro/x/z')).toBe('a')
  })
})

describe('tenantsBadgeCount / navBadgeLabel — badge « Locataires »', () => {
  it('additionne visites et candidatures, sans les demandes du marché', () => {
    expect(tenantsBadgeCount({ demandes: 4, visites: 2, candidatures: 1 })).toBe(3)
    expect(tenantsBadgeCount({ demandes: 40 })).toBe(0)
  })

  it('ignore un compteur absent (appel échoué) ou invalide', () => {
    expect(tenantsBadgeCount({ visites: 2 })).toBe(2)
    expect(tenantsBadgeCount({})).toBe(0)
    expect(tenantsBadgeCount({ visites: -1, candidatures: 3 })).toBe(3)
    expect(tenantsBadgeCount({ visites: Number.NaN, candidatures: 3 })).toBe(3)
  })

  it('affiche rien à zéro et plafonne à 99+', () => {
    expect(navBadgeLabel(0)).toBe('')
    expect(navBadgeLabel(undefined)).toBe('')
    expect(navBadgeLabel(7)).toBe('7')
    expect(navBadgeLabel(99)).toBe('99')
    expect(navBadgeLabel(120)).toBe('99+')
  })
})
