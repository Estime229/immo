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
