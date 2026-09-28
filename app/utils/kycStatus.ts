/**
 * `kyc_status` n'a pas d'énumération formellement publiée sur le Swagger —
 * traité en chaîne libre avec un repli explicite plutôt qu'un `switch`
 * exhaustif qui donnerait une fausse impression de couverture.
 */
export type VerificationSpace = 'locataire' | 'pro' | 'artisan'

export interface VerificationNotice {
  tone: 'warn' | 'danger' | 'info'
  title: string
  text: string
  cta: string
}

/** Actions réellement bloquées sans KYC — 403 `KYC_REQUIRED` constatés en direct (visites, création de bien) et règle affichée sur /kyc. */
const BLOCKED_ACTIONS: Record<VerificationSpace, string> = {
  // Réserver un séjour n'exige PAS de vérification côté API (constaté en live, Lot 49) — seules les visites (403 KYC_REQUIRED) et les retraits.
  locataire: 'demander une visite, candidater à un logement ni retirer de l\'argent',
  pro: 'publier un bien ni retirer de l\'argent',
  artisan: 'retirer vos gains'
}

/**
 * Bandeau des tableaux de bord pour un compte pas encore vérifié. `null` si
 * vérifié. Un compte tout juste créé est déjà `kyc_status: "pending"` avant
 * d'avoir déposé quoi que ce soit (constaté en direct) — `pending` seul ne
 * veut donc pas dire « en cours d'examen » : sans pièce d'identité déposée,
 * la vérification n'a en réalité pas commencé.
 */
export function deriveVerificationNotice(
  status: string | null | undefined,
  hasIdCard: boolean | undefined,
  space: VerificationSpace
): VerificationNotice | null {
  if (status === 'verified') return null
  const blocked = BLOCKED_ACTIONS[space]
  if (status === 'rejected') {
    return {
      tone: 'danger',
      title: 'Vérification refusée',
      text: `Un ou plusieurs documents ont été refusés. Tant que votre identité n'est pas vérifiée, vous ne pouvez pas ${blocked}.`,
      cta: 'Redéposer mes documents'
    }
  }
  if ((status === 'pending' || status === 'in_review') && hasIdCard) {
    return {
      tone: 'info',
      title: 'Vérification en cours',
      text: `L'équipe Immo examine vos documents, généralement sous 24 h. D'ici là, vous ne pouvez pas ${blocked}.`,
      cta: 'Suivre ma vérification'
    }
  }
  return {
    tone: 'warn',
    title: 'Compte non vérifié',
    text: `Déposez votre pièce d'identité pour faire vérifier votre compte. Sans vérification, vous ne pouvez pas ${blocked}.`,
    cta: 'Vérifier mon compte'
  }
}
