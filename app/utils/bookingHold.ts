/**
 * Une réservation `pending_payment` est un hold de 15 minutes (`expires_at`,
 * confirmé en direct sur `POST /bookings` et `GET /bookings/mine` — absent de
 * l'exemple Swagger mais bien présent en pratique). Passé ce délai, elle reste
 * affichée avec ce statut jusqu'au prochain rechargement : ce n'est PAS un
 * quatrième statut serveur, juste une dérivation d'affichage côté front.
 * Horloge injectable pour un test déterministe (même motif que pdfJob/paymentPolling).
 */

export interface HoldCountdown {
  expired: boolean
  minutesRemaining: number
}

export function deriveHoldCountdown(expiresAt: string | null, now: Date = new Date()): HoldCountdown | null {
  if (!expiresAt) return null
  const diffMs = new Date(expiresAt).getTime() - now.getTime()
  if (diffMs <= 0) return { expired: true, minutesRemaining: 0 }
  return { expired: false, minutesRemaining: Math.ceil(diffMs / 60000) }
}
