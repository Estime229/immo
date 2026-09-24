/**
 * `kyc_status` n'a pas d'énumération formellement publiée sur le Swagger —
 * traité en chaîne libre avec un repli explicite plutôt qu'un `switch`
 * exhaustif qui donnerait une fausse impression de couverture.
 */
export type KycBannerTone = 'ok' | 'warn' | 'danger' | 'neutral'

export interface KycStatusBanner {
  tone: KycBannerTone
  icon: string
  text: string
}

export function deriveKycStatusBanner(status: string | null | undefined): KycStatusBanner {
  if (status === 'verified') {
    return { tone: 'ok', icon: '✓', text: "Identité vérifiée par l'équipe Immo." }
  }
  if (status === 'pending' || status === 'in_review') {
    return { tone: 'warn', icon: '◷', text: 'Vos documents sont en cours de vérification.' }
  }
  if (status === 'rejected') {
    return {
      tone: 'danger',
      icon: '✕',
      text: 'Un ou plusieurs documents ont été refusés — vérifiez leur lisibilité et redéposez-les.'
    }
  }
  return {
    tone: 'neutral',
    icon: '?',
    text: 'Aucune vérification en cours — déposez vos justificatifs dans l\'onglet Documents.'
  }
}
