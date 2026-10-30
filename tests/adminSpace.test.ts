import { describe, expect, it } from 'vitest'
import { ADMIN_NAV, adminCountLabel, adminNavItemFor } from '../app/utils/adminNav'
import { personName } from '../app/utils/avatar'
import { formatAnciennete } from '../app/utils/filters'
import { roleHomePath } from '../app/utils/roleRoutes'
import { isPrivatePath } from '../app/utils/seo'

describe('menu de l\'espace admin', () => {
  it('rattache les sous-pages à leur rubrique (titre de l\'en-tête)', () => {
    expect(adminNavItemFor('/admin')?.key).toBe('apercu')
    expect(adminNavItemFor('/admin/kyc')?.key).toBe('kyc')
    expect(adminNavItemFor('/admin/kyc/abc-123')?.key).toBe('kyc')
    expect(adminNavItemFor('/admin/utilisateurs/abc')?.label).toBe('Utilisateurs')
  })
  it('ne confond pas l\'aperçu avec les autres rubriques', () => {
    expect(adminNavItemFor('/admin/inconnue')).toBeUndefined()
  })
  it('n\'a que des liens sous /admin, sans doublon', () => {
    const items = ADMIN_NAV.flatMap(g => g.items)
    expect(items.every(i => i.to === '/admin' || i.to.startsWith('/admin/'))).toBe(true)
    expect(new Set(items.map(i => i.key)).size).toBe(items.length)
  })
  it('affiche une pastille seulement s\'il y a quelque chose à traiter', () => {
    expect(adminCountLabel(0)).toBe('')
    expect(adminCountLabel(null)).toBe('')
    expect(adminCountLabel(7)).toBe('7')
    expect(adminCountLabel(250)).toBe('99+')
  })
})

describe('affichage des comptes', () => {
  it('n\'affiche jamais « null » pour un profil incomplet', () => {
    expect(personName(null, null)).toBe('')
    expect(personName('Awa', null)).toBe('Awa')
    expect(personName('Awa', 'Dossou')).toBe('Awa Dossou')
  })
  it('dit « aujourd\'hui » plutôt que « 0 jours »', () => {
    expect(formatAnciennete(new Date().toISOString())).toBe("aujourd'hui")
    expect(formatAnciennete(new Date(Date.now() - 36 * 3600 * 1000).toISOString())).toBe('1 jour')
    expect(formatAnciennete(new Date(Date.now() - 5 * 86400000).toISOString())).toBe('5 jours')
  })
})

describe('accès admin', () => {
  it('envoie un admin vers /admin après la connexion', () => {
    expect(roleHomePath('admin')).toBe('/admin')
  })
  it('n\'indexe pas l\'espace admin', () => {
    expect(isPrivatePath('/admin')).toBe(true)
    expect(isPrivatePath('/admin/login')).toBe(true)
  })
})
