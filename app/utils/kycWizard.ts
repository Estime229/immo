import type { KycDocumentType } from '../types/kyc'
import { validateIfu, validateRccm } from './onboarding'

/**
 * Parcours de vérification en étapes (refonte, dans l'esprit d'Airbnb). Avant :
 * trois onglets (Identité / Documents / Coordonnées) sans ordre ni bouton
 * « Suivant », et un menu déroulant de types de documents peu compris.
 *
 * Contraintes de l'API respectées : la pièce d'identité est **un seul
 * fichier** (`POST /user/id-card`, sans type ni recto/verso) — le recto et le
 * verso sont donc assemblés en une image avant l'envoi ; les justificatifs
 * passent par `POST /kyc/documents` avec leur type ; il n'existe pas de route
 * « soumettre le dossier » : l'équipe Immo examine ce qui a été déposé.
 */
export type KycRole = 'locataire' | 'bailleur' | 'artisan'
export type KycStep = 'intro' | 'piece' | 'photos' | 'documents' | 'coordonnees' | 'recap' | 'envoye'

export const FLOW: KycStep[] = ['intro', 'piece', 'photos', 'documents', 'coordonnees', 'recap']
export const STEP_KEYS: KycStep[] = [...FLOW, 'envoye']

/** Quatre segments de progression : pièce (2 écrans), justificatifs, coordonnées, vérification. */
export const PROGRESS_SEGMENTS = ["Pièce d'identité", 'Justificatifs', 'Coordonnées', 'Vérification'] as const
export function progressIndex(step: KycStep): number {
  return ({ intro: -1, piece: 0, photos: 0, documents: 1, coordonnees: 2, recap: 3, envoye: 4 } as Record<KycStep, number>)[step]
}

export function asStep(value: unknown): KycStep {
  return typeof value === 'string' && (STEP_KEYS as string[]).includes(value) ? (value as KycStep) : 'intro'
}
export function nextStep(step: KycStep): KycStep {
  const i = FLOW.indexOf(step)
  return i >= 0 && i < FLOW.length - 1 ? FLOW[i + 1]! : 'envoye'
}
export function prevStep(step: KycStep): KycStep {
  const i = FLOW.indexOf(step)
  return i > 0 ? FLOW[i - 1]! : 'intro'
}

/* ---- Pièce d'identité ---- */
export type IdSide = 'recto' | 'verso' | 'photo'
export type IdTypeKey = 'cni' | 'passeport' | 'permis' | 'sejour'

export interface IdTypeOption { key: IdTypeKey; label: string; hint: string; icon: string; sides: IdSide[]; photoTitle: string }

export const ID_TYPES: IdTypeOption[] = [
  { key: 'cni', label: "Carte d'identité ou CIP", hint: 'Recto et verso', icon: '🪪', sides: ['recto', 'verso'], photoTitle: "Photographiez votre carte d'identité ou votre CIP" },
  { key: 'passeport', label: 'Passeport', hint: 'La page avec votre photo', icon: '📘', sides: ['photo'], photoTitle: "Photographiez la page d'identité de votre passeport" },
  { key: 'permis', label: 'Permis de conduire', hint: 'Recto et verso', icon: '🚗', sides: ['recto', 'verso'], photoTitle: 'Photographiez votre permis de conduire' },
  { key: 'sejour', label: 'Carte de séjour', hint: 'Recto et verso', icon: '🌍', sides: ['recto', 'verso'], photoTitle: 'Photographiez votre carte de séjour' }
]

export const SIDE_LABEL: Record<IdSide, { title: string; hint: string }> = {
  recto: { title: 'Recto', hint: 'Face avec votre photo' },
  verso: { title: 'Verso', hint: 'Face arrière' },
  photo: { title: 'Page avec la photo', hint: 'Passeport ouvert, page d\'identité' }
}

export function idTypeOf(key: string | null | undefined): IdTypeOption | null {
  return ID_TYPES.find(t => t.key === key) ?? null
}

/**
 * Faces encore à fournir. Un PDF déposé en premier compte pour le document
 * entier (il contient déjà recto et verso) : aucune autre face n'est demandée.
 */
export function missingSides(type: IdTypeOption, provided: Partial<Record<IdSide, { type: string } | null>>): IdSide[] {
  const first = provided[type.sides[0]!]
  if (first && first.type === 'application/pdf') return []
  return type.sides.filter(s => !provided[s])
}

/* ---- Justificatifs par profil ---- */
export interface DocOption { type: KycDocumentType; label: string; description: string; recommended: boolean }

export const ROLE_DOCS: Record<KycRole, DocOption[]> = {
  locataire: [
    { type: 'payslip', label: 'Bulletins de salaire', description: 'Vos trois derniers bulletins, si vous êtes salarié. Un fichier par bulletin.', recommended: true },
    { type: 'employment_certificate', label: "Attestation d'employeur", description: 'Si vous n\'avez pas de bulletins, ou en complément.', recommended: false },
    { type: 'proof_of_address', label: 'Justificatif de domicile', description: 'Facture SBEE ou SONEB de moins de 3 mois, attestation de résidence…', recommended: false },
    { type: 'guarantor_id', label: 'Pièce du garant', description: 'Si une personne se porte garante de votre loyer.', recommended: false }
  ],
  bailleur: [
    { type: 'title_deed', label: 'Titre de propriété', description: 'Un par bien mis en location : titre foncier, acte de vente, attestation de détention…', recommended: true },
    { type: 'rccm_certificate', label: 'Certificat RCCM', description: 'Si vous louez au nom d\'une entreprise ou d\'une agence.', recommended: false },
    { type: 'proof_of_address', label: 'Justificatif de domicile', description: 'Facture SBEE ou SONEB de moins de 3 mois.', recommended: false }
  ],
  artisan: [
    { type: 'artisan_insurance', label: "Attestation d'assurance", description: 'Responsabilité civile professionnelle, en cours de validité.', recommended: true },
    { type: 'artisan_certification', label: 'Certifications', description: 'Diplômes, CQP, agréments : ils s\'affichent sur votre vitrine une fois validés.', recommended: false },
    { type: 'proof_of_address', label: 'Justificatif de domicile', description: 'Facture SBEE ou SONEB de moins de 3 mois.', recommended: false }
  ]
}

/* ---- Coordonnées ---- */
export interface CoordForm { fullName: string; company: string; ifu: string; rccm: string }

export function coordErrors(f: CoordForm, opts: { business: boolean; nameSaved: boolean }): Partial<Record<keyof CoordForm, string>> {
  const e: Partial<Record<keyof CoordForm, string>> = {}
  if (!f.fullName.trim() && !opts.nameSaved) e.fullName = 'Indiquez votre nom tel qu\'il figure sur votre pièce d\'identité.'
  if (opts.business) {
    const ifu = validateIfu(f.ifu)
    if (ifu) e.ifu = ifu
    const rccm = validateRccm(f.rccm)
    if (rccm) e.rccm = rccm
  }
  return e
}

/* ---- Passage à l'étape suivante ---- */
export interface WizardState {
  idType: IdTypeKey | null
  idCardOnFile: boolean
  keepExistingCard: boolean
  missingSides: IdSide[]
  docCount: number
  coordValid: boolean
}

/** Pourquoi « Suivant » est inactif (null : on peut continuer). */
export function blockReason(step: KycStep, s: WizardState): string | null {
  switch (step) {
    case 'piece': return s.idType || s.idCardOnFile ? null : 'Choisissez le type de pièce que vous allez photographier.'
    case 'photos':
      if (s.keepExistingCard && s.idCardOnFile) return null
      if (!s.idType) return 'Choisissez d\'abord le type de pièce.'
      return s.missingSides.length ? `Ajoutez encore : ${s.missingSides.map(x => SIDE_LABEL[x].title.toLowerCase()).join(' et ')}.` : null
    case 'documents': return s.docCount > 0 ? null : 'Ajoutez au moins un document.'
    case 'coordonnees': return s.coordValid ? null : 'Complétez ou corrigez les champs signalés.'
    default: return null
  }
}

/** Étapes encore incomplètes pour le récapitulatif et l'introduction. */
export function checklist(s: { idCardOnFile: boolean; docCount: number; nameSaved: boolean }) {
  return [
    { key: 'photos' as KycStep, label: "Pièce d'identité", done: s.idCardOnFile, detail: s.idCardOnFile ? 'Déposée' : 'À photographier' },
    { key: 'documents' as KycStep, label: 'Justificatifs', done: s.docCount > 0, detail: s.docCount > 0 ? `${s.docCount} document${s.docCount > 1 ? 's' : ''} déposé${s.docCount > 1 ? 's' : ''}` : 'À ajouter' },
    { key: 'coordonnees' as KycStep, label: 'Coordonnées', done: s.nameSaved, detail: s.nameSaved ? 'Enregistrées' : 'À compléter' }
  ]
}

/* ---- Assemblage recto / verso en une image ---- */
export interface Box { w: number; h: number }

/**
 * Recto au-dessus, verso dessous, à la même largeur (au plus `maxWidth`), avec
 * une marge ; hauteur totale plafonnée pour rester sous la limite d'envoi.
 */
export function stackLayout(a: Box, b: Box, maxWidth = 1600, gap = 32, maxHeight = 2800) {
  let width = Math.min(maxWidth, Math.max(a.w, b.w))
  let ha = Math.round(a.h * (width / a.w))
  let hb = Math.round(b.h * (width / b.w))
  // Marges fixes (haut, entre les faces, bas) : seules les images sont réduites.
  const room = maxHeight - gap * 3
  if (ha + hb > room) {
    const k = room / (ha + hb)
    width = Math.round(width * k)
    ha = Math.round(ha * k)
    hb = Math.round(hb * k)
  }
  const pad = gap
  return {
    width: width + pad * 2,
    height: ha + hb + gap + pad * 2,
    a: { x: pad, y: pad, w: width, h: ha },
    b: { x: pad, y: pad + ha + gap, w: width, h: hb }
  }
}
