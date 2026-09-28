/**
 * Vérification d'identité : ce qu'un compte peut faire, et quoi lui dire.
 *
 * Seule source de vérité pour les droits : `users.is_verified`. C'est ce que lit
 * `VerifiedUserGuard` côté API (code backend relu, et contrôlé en production le
 * 2026-09-28 : `false` pour un compte neuf, `true` seulement après validation du
 * KYC par un admin). `profile.kyc_status` ne sert qu'à nuancer le message : il
 * vaut déjà `pending` sur un compte neuf qui n'a rien déposé, et repasse à
 * `pending` à chaque modification du profil sans retirer les droits
 * (BACKEND-ISSUES #7). Il n'a pas d'énumération publiée sur le Swagger :
 * traité en chaîne libre.
 */
export type VerificationSpace = 'locataire' | 'pro' | 'artisan'

/** `todo` : rien de déposé · `review` : dossier envoyé, en attente d'un admin · `rejected` : refusé. */
export type VerificationStage = 'verified' | 'todo' | 'review' | 'rejected'

export interface VerificationNotice {
  tone: 'warn' | 'danger' | 'info'
  title: string
  text: string
  cta: string
}

export interface VerificationSubject {
  role?: string
  is_verified?: boolean
  profile?: { kyc_status?: string } | null
}

/**
 * Actions refusées par l'API (403 `error.KYC_REQUIRED`) tant que `is_verified`
 * est faux — relevé dans le code backend (`VerifiedUserGuard`) et rejoué en
 * production. Réserver un séjour et demander un retrait n'en font PAS partie :
 * un retrait par un compte non vérifié va jusqu'au contrôle du solde (constaté
 * le 2026-09-28). Côté artisan, rien n'est bloqué.
 */
const BLOCKED_ACTIONS: Record<VerificationSpace, string | null> = {
  locataire: 'demander une visite ni candidater à un logement',
  pro: 'publier ou modifier un bien, ni demander un artisan',
  artisan: null
}

/**
 * `submitted` : dossier complet déposé — pièce d'identité présente
 * (`GET /user/:id/id-card` → 200) ET au moins un justificatif
 * (`GET /kyc/documents/mine`). Même règle que l'introduction de /kyc.
 * `has_id_card` de `/auth/me` ne peut pas servir : il reste `false` même après
 * le dépôt d'une pièce (constaté par im-a0).
 */
export function verificationStage(user: VerificationSubject | null | undefined, submitted = false): VerificationStage {
  if (!user) return 'todo'
  if (user.role === 'admin' || user.is_verified === true) return 'verified'
  const status = user.profile?.kyc_status
  if (status === 'rejected') return 'rejected'
  if ((status === 'pending' || status === 'in_review') && submitted) return 'review'
  return 'todo'
}

/** Lien du parcours de vérification : son introduction s'adapte d'elle-même au statut ; `?redirect=` ramène à la page d'origine à la fin. */
export function verificationLink(redirect?: string) {
  return redirect ? `/kyc?redirect=${encodeURIComponent(redirect)}` : '/kyc'
}

/** Bandeau des tableaux de bord et carte de la barre latérale. `null` si vérifié. */
export function deriveVerificationNotice(stage: VerificationStage, space: VerificationSpace): VerificationNotice | null {
  if (stage === 'verified') return null
  const blocked = BLOCKED_ACTIONS[space]
  if (stage === 'rejected') {
    return {
      tone: 'danger',
      title: 'Vérification refusée',
      text: blocked
        ? `Un ou plusieurs documents ont été refusés. Tant que votre identité n'est pas vérifiée, vous ne pouvez pas ${blocked}.`
        : 'Un ou plusieurs documents ont été refusés. Redéposez-les pour afficher un profil vérifié.',
      cta: 'Redéposer mes documents'
    }
  }
  if (stage === 'review') {
    return {
      tone: 'info',
      title: 'Vérification en cours',
      text: blocked
        ? `L'équipe Immo examine vos documents, généralement sous 24 h. D'ici là, vous ne pouvez pas ${blocked}.`
        : "L'équipe Immo examine vos documents, généralement sous 24 h.",
      cta: 'Suivre ma vérification'
    }
  }
  return {
    tone: 'warn',
    title: 'Compte non vérifié',
    text: blocked
      ? `Déposez votre pièce d'identité pour faire vérifier votre compte. Sans vérification, vous ne pouvez pas ${blocked}.`
      : "Déposez votre pièce d'identité : un profil vérifié rassure les clients qui vous confient une intervention.",
    cta: 'Vérifier mon compte'
  }
}

/** Fenêtre affichée quand on touche une action verrouillée. `action` est à l'infinitif (« publier un bien »). */
export function verificationGateCopy(stage: VerificationStage, action: string) {
  if (stage === 'review') {
    return {
      title: 'Vérification en cours',
      text: `Vos documents sont en cours d'examen, généralement sous 24 h. Vous pourrez ${action} dès que votre identité sera validée.`,
      cta: 'Suivre ma vérification'
    }
  }
  if (stage === 'rejected') {
    return {
      title: 'Vérification refusée',
      text: `Un ou plusieurs documents ont été refusés. Redéposez-les pour pouvoir ${action}.`,
      cta: 'Redéposer mes documents'
    }
  }
  return {
    title: 'Vérifiez votre compte',
    text: `Pour la sécurité de tous, Immo vérifie l'identité de chacun avant de ${action}. Quelques minutes suffisent, la validation prend généralement moins de 24 h.`,
    cta: 'Vérifier mon compte'
  }
}
