import type { UserRole } from '~/types/auth'

export interface OnboardingDraft {
  first_name?: string
  last_name?: string
  role?: UserRole
}

/**
 * Onboarding — seul chemin qui écrit le nom affiché et le rôle d'un compte
 * neuf (voir `utils/onboarding.ts`). `phone_number` n'est PAS accepté ici
 * (retiré silencieusement par l'API, vérifié en live) : aucun endpoint ne
 * l'enregistre après la vérification du code.
 */
export function useOnboardingApi() {
  const api = useApi()

  async function saveDraft(draft: OnboardingDraft) {
    return api.post<OnboardingDraft>('/onboarding/draft', draft)
  }

  /** Ne renvoie pas l'utilisateur à jour — relire /auth/me ensuite. */
  async function finalize() {
    return api.post<{ success: boolean }>('/onboarding/finalize')
  }

  return { saveDraft, finalize }
}
