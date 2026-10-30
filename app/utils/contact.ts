/**
 * Formulaire de contact (Lot 56) — mêmes limites que l'API (`POST /contact` :
 * nom ≤ 150, e-mail valide, message ≤ 3 000), dites avant l'envoi.
 */
export interface ContactForm { name: string; email: string; subject: string; message: string }

export function validateContact(f: ContactForm): Partial<Record<keyof ContactForm, string>> {
  const errors: Partial<Record<keyof ContactForm, string>> = {}
  if (!f.name.trim()) errors.name = 'Indiquez votre nom.'
  else if (f.name.trim().length > 150) errors.name = 'Nom trop long (150 caractères au maximum).'
  if (!f.email.trim()) errors.email = 'Indiquez votre adresse e-mail pour recevoir la réponse.'
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email.trim())) errors.email = 'Adresse e-mail invalide.'
  if (f.message.trim().length < 10) errors.message = 'Décrivez votre demande en quelques mots (10 caractères au moins).'
  else if (f.message.trim().length > 3000) errors.message = 'Message trop long (3 000 caractères au maximum).'
  return errors
}

/**
 * Coordonnées publiques d'Immo, affichées sur /contact, dans le pied de page et dans la politique
 * de confidentialité — une seule source, pour les corriger partout d'un coup. À CONFIRMER par
 * l'équipe : jamais validées (INTEGRATION-TESTS.md, « coordonnées à confirmer »), et le pied de
 * page affichait une autre adresse (« Boulevard de la Marina ») ; seule celle de /contact est gardée.
 */
export const IMMO_CONTACT = {
  whatsapp: '+229 97 00 12 12',
  phone: '+229 21 30 45 90',
  email: 'bonjour@immo.bj',
  addressLines: ['Lot 1247, Fidjrossè Kpota', 'Cotonou, Bénin']
} as const

/** `tel:+22921304590` — chiffres et « + » seulement. */
export function telHref(number: string): string {
  return `tel:${number.replace(/[^\d+]/g, '')}`
}

/** `https://wa.me/22997001212` — wa.me n'accepte que les chiffres, indicatif compris. */
export function whatsappHref(number: string): string {
  return `https://wa.me/${number.replace(/\D/g, '')}`
}
