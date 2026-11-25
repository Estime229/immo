import { describe, expect, it } from 'vitest'
import { gatewayNeedsPhone, gatewaySupported, normalizeBeninPhone, pendingWithdrawal, spendableSavings, transactionStatusBadge, validateRecharge, validateWithdrawal, walletAmount, walletBreakdown, walletBreakdownLine, walletInconsistent, withdrawalMethodLabel } from '../app/utils/wallet'
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

describe('solde unique et sa répartition', () => {
  const fmt = (n: number) => `${n} F`

  it('lit les montants en chaîne de l\'API sans les concaténer', () => {
    expect(walletAmount('125000.00')).toBe(125000)
    expect(walletAmount(' 95000.50 ')).toBe(95000.5)
    expect(walletAmount(42)).toBe(42)
    expect(walletAmount(null)).toBe(0)
    expect(walletAmount(undefined)).toBe(0)
    expect(walletAmount('')).toBe(0)
    expect(walletAmount('abc')).toBe(0)
  })

  it('le total est balance_total : la tirelire en fait partie, elle ne s\'y ajoute pas', () => {
    // Recharge de 120 000 : l'API crédite les deux soldes du même montant.
    expect(walletBreakdown('120000.00', '120000.00')).toEqual({ total: 120000, reserved: 120000, free: 0 })
    expect(walletBreakdown('135000.00', '95000.00')).toEqual({ total: 135000, reserved: 95000, free: 40000 })
  })

  it('plafonne la part réservée au total et ne rend jamais de part négative', () => {
    expect(walletBreakdown('7000.00', '30000.00')).toEqual({ total: 7000, reserved: 7000, free: 0 })
    expect(walletBreakdown('-9000.00', '14000.00')).toEqual({ total: -9000, reserved: 0, free: 0 })
    expect(walletBreakdown(null, undefined)).toEqual({ total: 0, reserved: 0, free: 0 })
  })

  it('formule la ligne sous le solde selon les parts', () => {
    expect(walletBreakdownLine(walletBreakdown('135000', '95000'), fmt)).toBe('dont 95000 F réservés au logement (loyers et réservations) · 40000 F libres')
    expect(walletBreakdownLine(walletBreakdown('50000', '0'), fmt)).toMatch(/^aucune part réservée/)
    expect(walletBreakdownLine(walletBreakdown('50000', '50000'), fmt)).toMatch(/^entièrement réservés/)
    expect(walletBreakdownLine(walletBreakdown('0', '0'), fmt)).toBe('')
    expect(walletBreakdownLine(walletBreakdown('-9000', '14000'), fmt)).toBe('')
  })
})

describe('historique : badge de statut', () => {
  it('ne badge pas un mouvement terminé, quelle que soit la casse', () => {
    expect(transactionStatusBadge('completed')).toBeNull()
    expect(transactionStatusBadge('COMPLETED')).toBeNull()
  })
  it('signale ce qui apprend quelque chose', () => {
    expect(transactionStatusBadge('pending')).toEqual({ label: 'En attente', tone: 'warn' })
    expect(transactionStatusBadge('processing')?.label).toBe('En cours')
    expect(transactionStatusBadge('failed')).toEqual({ label: 'Échoué', tone: 'danger' })
    expect(transactionStatusBadge('cancelled')?.label).toBe('Annulé')
    expect(transactionStatusBadge('refunded')?.label).toBe('Remboursé')
  })
  it('garde visible un statut inconnu ou absent', () => {
    expect(transactionStatusBadge('weird')?.label).toBe('Statut inconnu')
    expect(transactionStatusBadge(null)?.label).toBe('Statut inconnu')
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
  it('une demande annulée (#83/#84) ne bloque plus une nouvelle demande', () => {
    expect(pendingWithdrawal([w({ status: 'cancelled' })])).toBeNull()
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
