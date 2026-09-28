import { describe, expect, it } from 'vitest'
import { gatewayNeedsPhone, gatewaySupported, normalizeBeninPhone, pendingWithdrawal, spendableSavings, validateRecharge, validateWithdrawal, walletInconsistent, withdrawalMethodLabel } from '../app/utils/wallet'
import type { WithdrawalRequest } from '../app/types/wallet'

const w = (over: Partial<WithdrawalRequest>): WithdrawalRequest => ({ id: 'w', amount: '1000.00', method: 'MTN_MOMO', phone_number: '+22997000000', status: 'processed', created_at: '2026-09-20T10:00:00Z', ...over })

describe('soldes (#82)', () => {
  it('plafonne la tirelire utilisable au total, jamais négative', () => {
    expect(spendableSavings(7000, 30000)).toBe(7000)
    expect(spendableSavings(50000, 20000)).toBe(20000)
    expect(spendableSavings(-9000, 14000)).toBe(0)
  })
  it('repère les soldes incohérents constatés en live', () => {
    expect(walletInconsistent(7000, 30000)).toBe(true)
    expect(walletInconsistent(-9000, 14000)).toBe(true)
    expect(walletInconsistent(71000, 0)).toBe(false)
    expect(walletInconsistent(5000, 5000)).toBe(false)
  })
})

describe('retraits', () => {
  it('libelle la méthode renvoyée en minuscules par l\'API', () => {
    expect(withdrawalMethodLabel('mtn_momo')).toBe('MTN')
    expect(withdrawalMethodLabel('MOOV_MONEY')).toBe('Moov')
    expect(withdrawalMethodLabel('bank_transfer')).toBe('Virement bancaire')
    expect(withdrawalMethodLabel('autre')).toBe('autre')
  })
  it('trouve la demande en attente la plus récente', () => {
    expect(pendingWithdrawal([w({ id: 'a' }), w({ id: 'b', status: 'pending', created_at: '2026-09-21T00:00:00Z' }), w({ id: 'c', status: 'pending', created_at: '2026-09-25T00:00:00Z' })])?.id).toBe('c')
    expect(pendingWithdrawal([w({ status: 'rejected' })])).toBeNull()
  })
  it('normalise les numéros béninois (8 ou 10 chiffres) et refuse le reste', () => {
    expect(normalizeBeninPhone('97 00 00 00')).toBe('+22997000000')
    expect(normalizeBeninPhone('+229 01 97 00 00 00')).toBe('+2290197000000')
    expect(normalizeBeninPhone('0197000000')).toBe('+2290197000000')
    expect(normalizeBeninPhone('00229 66000001')).toBe('+22966000001')
    expect(normalizeBeninPhone('abc')).toBeNull()
    expect(normalizeBeninPhone('9700')).toBeNull()
    expect(normalizeBeninPhone('0297000000')).toBeNull()
  })
  it('valide un retrait dans l\'ordre utile à l\'écran', () => {
    const base = { amount: 5000, phone: '97000000', balance: 10000, pending: null }
    expect(validateWithdrawal(base)).toBeNull()
    expect(validateWithdrawal({ ...base, pending: w({ status: 'pending', amount: '2500.00' }) })).toContain('2')
    expect(validateWithdrawal({ ...base, amount: 400 })).toContain('500')
    expect(validateWithdrawal({ ...base, amount: 20000 })).toContain('dépasse')
    expect(validateWithdrawal({ ...base, phone: '' })).toContain('numéro')
    expect(validateWithdrawal({ ...base, phone: 'abc' })).toContain('invalide')
    expect(validateWithdrawal({ ...base, balance: -9000 })).toContain('dépasse')
  })
})

describe('recharge', () => {
  it('demande un numéro pour le Mobile Money direct seulement', () => {
    expect(gatewayNeedsPhone({ type: 'GSM_MTN' })).toBe(true)
    expect(gatewayNeedsPhone({ type: 'gsm_moov' })).toBe(true)
    expect(gatewayNeedsPhone({ type: 'FEDAPAY' })).toBe(false)
  })
  it('écarte Kkiapay (widget non chargé)', () => {
    expect(gatewaySupported({ type: 'KKIAPYA' })).toBe(false)
    expect(gatewaySupported({ type: 'FEDAPAY' })).toBe(true)
  })
  it('refuse sous 500 F et sans numéro valide pour MTN/Moov', () => {
    expect(validateRecharge({ amount: 400, gateway: { type: 'FEDAPAY' }, phone: '' })).toContain('500')
    expect(validateRecharge({ amount: 5000, gateway: { type: 'FEDAPAY' }, phone: '' })).toBeNull()
    expect(validateRecharge({ amount: 5000, gateway: { type: 'GSM_MTN' }, phone: '' })).toContain('numéro')
    expect(validateRecharge({ amount: 5000, gateway: { type: 'GSM_MTN' }, phone: '66000001' })).toBeNull()
    expect(validateRecharge({ amount: 5000, gateway: null, phone: '' })).toContain('moyen')
  })
})
