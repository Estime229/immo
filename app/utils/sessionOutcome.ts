import type { AuthUser } from '../types/auth'

/**
 * Que faire une fois l'utilisateur authentifié et son profil (GET /auth/me)
 * résolu. Isolé en fonction pure pour être testable sans composable Nuxt.
 * Voir 11-INTEGRATION-AUTH-ET-PUBLIC.md, I1 points 2 et 5.
 */
export type SessionOutcome =
  | { kind: 'ok'; user: AuthUser; isNewUser: boolean }
  | { kind: 'restricted'; user: AuthUser; isNewUser: boolean }
  | { kind: 'banned'; message: string }
  /** GET /auth/me a renvoyé 404 : compte tout juste créé, pas encore finalisé côté backend. */
  | { kind: 'pending' }

/**
 * `isNewUser` vient de la réponse verify-otp/google elle-même (`is_new_user`),
 * jamais de /auth/me qui ne le porte pas — à l'appelant de le transmettre.
 */
export function decideSessionOutcome(user: AuthUser | null, isNewUser = false): SessionOutcome {
  if (!user) return { kind: 'pending' }

  if (user.status === 'banned') {
    return {
      kind: 'banned',
      message: 'Votre compte a été suspendu. Contactez le support pour en savoir plus.'
    }
  }

  // 'restricted' est posé par un cron après 6 mois d'inactivité (voir socle) : on
  // laisse l'utilisateur entrer, on se contente de le signaler à l'appelant.
  if (user.status === 'restricted') {
    return { kind: 'restricted', user, isNewUser }
  }

  return { kind: 'ok', user, isNewUser }
}
