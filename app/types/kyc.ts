/**
 * Types du module KYC/KYB. Le Swagger documente ces réponses avec des
 * `example` typés (pas de schéma `properties` pour les réponses), donc écrits
 * à la main — vérifiés le 2026-09-17 sur le Swagger live.
 */

/**
 * 8 valeurs sur le Swagger live, `employment_certificate` compris — l'écart de
 * 6 vs 7 valeurs documenté dans 11-INTEGRATION-AUTH-ET-PUBLIC.md (I3) est déjà
 * résolu côté API, il ne restait qu'à aligner le front dessus.
 */
export type KycDocumentType =
  | 'title_deed'
  | 'rccm_certificate'
  | 'proof_of_address'
  | 'payslip'
  | 'artisan_insurance'
  | 'artisan_certification'
  | 'employment_certificate'
  | 'guarantor_id'

/**
 * GET /kyc/documents/mine et la réponse de POST /kyc/documents ne renvoient
 * que ces trois champs — ni statut de validation, ni nom de fichier original,
 * ni extension. Une UI qui en affiche plus les invente.
 */
export interface KycDocument {
  id: string
  document_type: KycDocumentType
  created_at: string
}

export const KYC_DOCUMENT_TYPE_LABELS: Record<KycDocumentType, string> = {
  title_deed: 'Titre de propriété',
  rccm_certificate: 'RCCM',
  proof_of_address: 'Justificatif de domicile',
  payslip: 'Bulletin de salaire',
  artisan_insurance: "Attestation d'assurance",
  artisan_certification: 'Certification professionnelle',
  employment_certificate: "Attestation d'employeur",
  guarantor_id: 'Pièce du garant'
}
