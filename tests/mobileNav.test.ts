import { describe, expect, it } from 'vitest'
import { detectMobilePlatform, isTabActive, pickStoreUrl, platformSubtitle } from '../app/utils/mobileNav'

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; SM-A546B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36'
const IPAD_DESKTOP_MODE = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15'

describe('detectMobilePlatform', () => {
  it('reconnaît iPhone et Android', () => {
    expect(detectMobilePlatform(IPHONE)).toBe('ios')
    expect(detectMobilePlatform(ANDROID)).toBe('android')
  })

  it("reconnaît un iPad qui se présente comme un Mac, mais pas un vrai Mac", () => {
    expect(detectMobilePlatform(IPAD_DESKTOP_MODE, 5)).toBe('ios')
    expect(detectMobilePlatform(IPAD_DESKTOP_MODE, 0)).toBe('other')
  })

  it('retombe sur "other" sans user-agent', () => {
    expect(detectMobilePlatform(undefined)).toBe('other')
    expect(detectMobilePlatform('')).toBe('other')
  })
})

describe('pickStoreUrl', () => {
  const urls = { ios: 'https://apps.apple.com/app/id1', android: 'https://play.google.com/store/apps/details?id=immo' }

  it("renvoie le store de l'appareil", () => {
    expect(pickStoreUrl('ios', urls)).toBe(urls.ios)
    expect(pickStoreUrl('android', urls)).toBe(urls.android)
  })

  it('préfère Google Play pour un appareil inconnu, puis l\'App Store', () => {
    expect(pickStoreUrl('other', urls)).toBe(urls.android)
    expect(pickStoreUrl('other', { ios: urls.ios, android: '' })).toBe(urls.ios)
  })

  it("ne fabrique jamais de lien quand le store de l'appareil n'est pas configuré", () => {
    expect(pickStoreUrl('ios', { ios: '', android: urls.android })).toBe('')
    expect(pickStoreUrl('other', { ios: '', android: '' })).toBe('')
  })
})

describe('platformSubtitle', () => {
  it('annonce les deux plateformes quand l\'appareil est inconnu', () => {
    expect(platformSubtitle('other')).toContain('iOS et Android')
    expect(platformSubtitle('ios')).toContain('iPhone')
    expect(platformSubtitle('android')).toContain('Android')
  })
})

describe('isTabActive', () => {
  it("n'allume un onglet racine que sur son chemin exact", () => {
    expect(isTabActive('/pro', { to: '/pro' })).toBe(true)
    expect(isTabActive('/pro/biens', { to: '/pro' })).toBe(false)
    expect(isTabActive('/recherche', { to: '/' })).toBe(false)
  })

  it('garde un onglet actif sur ses sous-pages', () => {
    expect(isTabActive('/pro/biens/fiche', { to: '/pro/biens' })).toBe(true)
    expect(isTabActive('/pro/biensxyz', { to: '/pro/biens' })).toBe(false)
  })

  it('prend en compte les chemins associés', () => {
    const explorer = { to: '/', alsoActiveOn: ['/recherche', '/biens', '/vitrine'] }
    expect(isTabActive('/', explorer)).toBe(true)
    expect(isTabActive('/biens/42', explorer)).toBe(true)
    expect(isTabActive('/favoris', explorer)).toBe(false)
  })
})
