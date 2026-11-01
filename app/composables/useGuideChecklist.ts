import type { VerificationSpace } from '~/utils/kycStatus'

/**
 * Parcours de démarrage de chaque espace (`<LayoutGuideChecklist>`). Masqué à la main,
 * il se réaffiche depuis la page Guide de l'espace. Cookie plutôt que localStorage pour
 * que le serveur le lise au rendu et évite le flash avant hydratation.
 */
export function useGuideChecklist(space: VerificationSpace) {
  const hidden = useCookie<string | null>(`bayo_guide_${space}`, {
    default: () => null,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365
  })
  const dismissed = computed(() => hidden.value === '1')
  function dismiss() { hidden.value = '1' }
  function restore() { hidden.value = null }
  return { dismissed, dismiss, restore }
}
