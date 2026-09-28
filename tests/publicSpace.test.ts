import { describe, expect, it } from 'vitest'
import { DEFAULT_TITLE, formatTitle, isPrivatePath, publicRouteTitle } from '../app/utils/seo'
import { validateContact } from '../app/utils/contact'
import { spaceAccess, spaceOf } from '../app/utils/roleRoutes'

describe('titres et indexation (aucune page n\'avait de <title>)', () => {
  it('ajoute le nom du site, et un titre complet par défaut', () => {
    expect(formatTitle('Nous contacter')).toBe('Nous contacter · Immo')
    expect(formatTitle('')).toBe(DEFAULT_TITLE)
    expect(formatTitle(null)).toBe(DEFAULT_TITLE)
  })
  it('donne un titre aux routes publiques, y compris celles qui n\'en posent pas', () => {
    expect(publicRouteTitle('/')).toBeNull()
    expect(publicRouteTitle('/recherche')).toBe('Rechercher un logement')
    expect(publicRouteTitle('/biens/abc')).toBe('Logement à louer')
    expect(publicRouteTitle('/invite/xyz')).toBe('Invitation')
    expect(publicRouteTitle('/inconnue')).toBeNull()
  })
  it('n\'indexe ni les espaces connectés ni les flux techniques ni la maquette', () => {
    for (const p of ['/locataire', '/pro/wallet', '/artisan/missions', '/kyc', '/connexion', '/invite/t', '/payment/return', '/design-system']) expect(isPrivatePath(p)).toBe(true)
    for (const p of ['/', '/recherche', '/biens/x', '/vitrine/y', '/louer', '/faq', '/prof']) expect(isPrivatePath(p)).toBe(false)
  })
})

describe('formulaire de contact (POST /contact)', () => {
  const ok = { name: 'Aline Houngbo', email: 'aline@example.com', subject: 'Autre', message: 'Bonjour, une question sur ma caution.' }
  it('accepte un message complet', () => {
    expect(validateContact(ok)).toEqual({})
  })
  it('reprend les limites de l\'API avant l\'envoi', () => {
    expect(validateContact({ ...ok, name: ' ' }).name).toBeTruthy()
    expect(validateContact({ ...ok, name: 'x'.repeat(151) }).name).toContain('150')
    expect(validateContact({ ...ok, email: 'pas-un-email' }).email).toContain('invalide')
    expect(validateContact({ ...ok, message: 'court' }).message).toContain('10')
    expect(validateContact({ ...ok, message: 'x'.repeat(3001) }).message).toContain('3 000')
  })
})

describe('accès aux espaces (aucune garde avant)', () => {
  it('reconnaît l\'espace d\'une route', () => {
    expect(spaceOf('/pro/wallet')).toBe('pro')
    expect(spaceOf('/locataire')).toBe('locataire')
    expect(spaceOf('/profil')).toBeNull()
    expect(spaceOf('/prof')).toBeNull()
  })
  it('renvoie un locataire hors de l\'espace pro, vers sa messagerie si c\'était la messagerie', () => {
    expect(spaceAccess('/pro', 'tenant', ['tenant'])).toEqual({ action: 'redirect', path: '/locataire', keepQuery: false })
    expect(spaceAccess('/pro/messages', 'tenant', ['tenant'])).toEqual({ action: 'redirect', path: '/locataire/messages', keepQuery: true })
    expect(spaceAccess('/artisan', 'landlord', ['landlord'])).toEqual({ action: 'redirect', path: '/pro', keepQuery: false })
  })
  it('bascule un compte qui a le rôle sans qu\'il soit actif (sinon 403, #78)', () => {
    expect(spaceAccess('/pro/baux', 'tenant', ['tenant', 'landlord'])).toEqual({ action: 'switch', role: 'landlord' })
    expect(spaceAccess('/pro', 'landlord', ['landlord'])).toEqual({ action: 'ok' })
  })
  it('laisse l\'espace locataire ouvert (un propriétaire peut louer sans le rôle tenant)', () => {
    expect(spaceAccess('/locataire/bail', 'landlord', ['landlord'])).toEqual({ action: 'ok' })
    expect(spaceAccess('/locataire/messages', 'landlord', ['landlord'])).toEqual({ action: 'redirect', path: '/pro/messages', keepQuery: true })
    expect(spaceAccess('/locataire/messages', 'artisan', ['artisan'])).toEqual({ action: 'redirect', path: '/artisan/messages', keepQuery: true })
    expect(spaceAccess('/locataire/messages', 'tenant', ['tenant'])).toEqual({ action: 'ok' })
  })
  it('ne touche ni aux pages publiques ni à l\'admin', () => {
    expect(spaceAccess('/recherche', 'tenant', ['tenant'])).toEqual({ action: 'ok' })
    expect(spaceAccess('/pro', 'admin', ['admin'])).toEqual({ action: 'ok' })
  })
})
