import type { BookingActionResult, BookingSummary, PayBookingResult, PromoPreviewResult } from '~/types/tenant'

/**
 * Module réservations courte durée — voir 12-INTEGRATION-LOCATAIRE.md, IL5,
 * et 11-INTEGRATION-AUTH-ET-PUBLIC.md, I4 pour `create` (câblé une fois la
 * fiche logement publique disponible pour fournir un `unit_id` réel).
 */
export function useBookingsApi() {
  const api = useApi()

  async function fetchMine() {
    return api.get<BookingSummary[]>('/bookings/mine')
  }

  /** Crée un hold de 15 min (pending_payment) — ne bloque pas encore le calendrier. 409 si les dates viennent d'être prises. */
  async function create(unitId: string, checkIn: string, checkOut: string) {
    return api.post<BookingActionResult>('/bookings', { unit_id: unitId, check_in: checkIn, check_out: checkOut })
  }

  /** Aucun débit — vérifié en direct, y compris le refus explicite d'un code invalide. */
  async function previewPromo(id: string, code?: string) {
    return api.post<PromoPreviewResult>(`/bookings/${id}/preview-promo`, code ? { code } : {})
  }

  /** Débite la tirelire et crédite le propriétaire immédiatement — revérifie la disponibilité, peut renvoyer 409 si prise entre-temps. */
  async function pay(id: string, promoCode?: string) {
    return api.post<PayBookingResult>(`/bookings/${id}/pay`, promoCode ? { promo_code: promoCode } : {})
  }

  /** Crée un NOUVEAU segment (pending_payment, son propre hold de 15 min) plutôt que de modifier la réservation d'origine. */
  async function extend(id: string, newCheckOut: string) {
    return api.post<BookingActionResult>(`/bookings/${id}/extend`, { new_check_out: newCheckOut })
  }

  /** Uniquement tant que pending_payment — une réservation confirmée ne s'annule pas par cette route. */
  async function cancel(id: string) {
    return api.patch<BookingActionResult>(`/bookings/${id}/cancel`)
  }

  return { fetchMine, create, previewPromo, pay, extend, cancel }
}
