export interface PaymentGateway {
  id: string
  name: string
  type: string
  isActive: boolean
  is_system: boolean
  isTestMode: boolean
  config: Record<string, string>
  createdAt: string
  updatedAt: string
}

export interface UpdatePaymentGatewayInput {
  name?: string
  isActive?: boolean
  isTestMode?: boolean
}

export function usePaymentGateways() {
  const { apiFetch } = useApi()

  function fetchGateways() {
    return apiFetch<PaymentGateway[]>('/admin/payment/gateways')
  }

  function updateGateway(id: string, data: UpdatePaymentGatewayInput) {
    return apiFetch<PaymentGateway>(`/admin/payment/gateways/${id}`, { method: 'PATCH', body: data })
  }

  return { fetchGateways, updateGateway }
}
