export interface Currency {
  id: string
  currency_code: string
  currency_symbol?: string
  rate_to_cfa: string
  is_active: boolean
  is_system: boolean
  created_at?: string
  updated_at?: string
}

export interface CurrencyInput {
  code: string
  name: string
  symbol: string
  rate_to_xof: number
}

/** Devise de référence : tous les taux sont exprimés vers elle (1 XOF = 1). */
export const BASE_CURRENCY = 'XOF'

/**
 * Nom français d'une devise d'après son code ISO (« EUR » → « euro »). `GET /currencies`
 * ne renvoie ni nom ni symbole (vérifié en live) : on le déduit du code, sans rien inventer.
 */
export function currencyName(code: string): string {
  try {
    const name = new Intl.DisplayNames(['fr'], { type: 'currency' }).of(code.toUpperCase())
    return name && name.toUpperCase() !== code.toUpperCase() ? name : ''
  } catch {
    return ''
  }
}

export function useCurrencies() {
  const { apiFetch } = useApi()

  function fetchCurrencies() {
    return apiFetch<Currency[]>('/currencies')
  }

  function createCurrency(data: CurrencyInput) {
    return apiFetch<Currency>('/currencies', { method: 'POST', body: data })
  }

  function updateRate(id: string, rateToCfa: number) {
    return apiFetch<Currency>(`/currencies/${id}`, { method: 'PATCH', body: { rate_to_cfa: rateToCfa } })
  }

  function deleteCurrency(id: string) {
    return apiFetch(`/currencies/${id}`, { method: 'DELETE' })
  }

  return { fetchCurrencies, createCurrency, updateRate, deleteCurrency }
}
